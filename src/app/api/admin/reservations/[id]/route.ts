import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { confirmReservation } from "@/lib/reservations";
import { cancelScheduledMessages } from "@/lib/messaging/schedule";
import { logAudit } from "@/lib/panel";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/reservations/[id]
 * Body: { action: "confirm" | "cancel" | "complete", notes?: string }
 * - confirm → marca paid/confirmed + correos (mismo camino que el webhook).
 * - cancel  → libera las fechas (el exclusion constraint ignora cancelled).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  let body: { action?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const actor = auth.user.email ?? "panel";

  switch (body.action) {
    case "confirm": {
      const result = await confirmReservation(id, { paymentMethod: "bank_transfer" });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 422 });
      }
      logAudit(db, { actor, action: "confirmar_reserva", entity: "reservation", entityId: id }).catch(() => {});
      return NextResponse.json({
        ok: true,
        status: "confirmed",
        already_confirmed: result.alreadyConfirmed ?? false,
      });
    }

    case "cancel": {
      const { data, error } = await db
        .from("reservations")
        .update({
          status: "cancelled",
          ...(body.notes ? { notes: body.notes } : {}),
        })
        .eq("id", id)
        .neq("status", "cancelled")
        .select("id")
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) {
        return NextResponse.json(
          { error: "Reserva no encontrada o ya cancelada" },
          { status: 404 }
        );
      }
      // reserva cancelada → su timeline de mensajes pendientes también
      await cancelScheduledMessages(db, id);
      logAudit(db, { actor, action: "cancelar_reserva", entity: "reservation", entityId: id, detail: { notes: body.notes ?? null } }).catch(() => {});
      return NextResponse.json({ ok: true, status: "cancelled" });
    }

    case "complete": {
      const { data, error } = await db
        .from("reservations")
        .update({ status: "completed" })
        .eq("id", id)
        .eq("status", "confirmed")
        .select("id")
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) {
        return NextResponse.json(
          { error: "Solo se pueden completar reservas confirmadas" },
          { status: 409 }
        );
      }
      logAudit(db, { actor, action: "completar_reserva", entity: "reservation", entityId: id }).catch(() => {});
      return NextResponse.json({ ok: true, status: "completed" });
    }

    default:
      return NextResponse.json(
        { error: "action debe ser confirm | cancel | complete" },
        { status: 400 }
      );
  }
}

/** GET /api/admin/reservations/[id] — detalle con addons y comprobante. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("reservations")
    .select("*, reservation_addons(quantity, unit_price, addons(name, type)), properties(slug, name)")
    .eq("id", id)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }

  // URL firmada del comprobante (1 hora) si existe
  let proof_url: string | null = null;
  if (data.payment_proof_url) {
    const { data: signed } = await db.storage
      .from("payment-proofs")
      .createSignedUrl(data.payment_proof_url, 3600);
    proof_url = signed?.signedUrl ?? null;
  }

  return NextResponse.json({ reservation: data, payment_proof_signed_url: proof_url });
}
