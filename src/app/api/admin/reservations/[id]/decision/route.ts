import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { confirmReservation } from "@/lib/reservations";
import { sendBrandedEmail } from "@/lib/notifications/email";
import { logAudit } from "@/lib/panel";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reservations/[id]/decision — confirmar/rechazar el pago
 * desde el DASHBOARD (addendum E20). MISMA semántica e idempotencia que los
 * botones del correo: si ya se confirmó por el email, aquí devuelve
 * already=true (y viceversa) — sin dobles confirmaciones ni dobles correos
 * (confirmReservation es idempotente y el timeline tiene unique).
 * Body: { action: "confirmar" | "rechazar", metodo?: "transfer"|"cash", motivo?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;
  const actor = auth.user.email ?? "panel";

  const { id } = await params;
  let body: { action?: string; metodo?: string; motivo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: r } = await db
    .from("reservations")
    .select("id, status, payment_status, guest_name, guest_email, check_in, check_out")
    .eq("id", id)
    .single();
  if (!r) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  const codigo = `${SITE.bookingCodePrefix}-${r.id.slice(0, 8).toUpperCase()}`;

  if (body.action === "confirmar") {
    const metodo = body.metodo === "cash" ? "cash" : "bank_transfer";
    const result = await confirmReservation(id, { paymentMethod: metodo });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
    logAudit(db, {
      actor, action: "confirmar_pago", entity: "reservation", entityId: id,
      detail: { codigo, metodo, already: result.alreadyConfirmed ?? false },
    }).catch(() => {});
    return NextResponse.json({ ok: true, already: result.alreadyConfirmed ?? false });
  }

  if (body.action === "rechazar") {
    if (r.status === "confirmed") {
      return NextResponse.json(
        { error: "La reserva ya está confirmada — no se puede rechazar", already: true },
        { status: 409 }
      );
    }
    if (r.payment_status !== "review") {
      return NextResponse.json({ ok: true, already: true, nota: "No había comprobante en revisión" });
    }
    await db.from("reservations").update({ payment_status: "unpaid" }).eq("id", id);
    const motivo = body.motivo?.trim();
    sendBrandedEmail({
      to: r.guest_email,
      subject: `Sobre tu comprobante · ${codigo} · ${SITE.name}`,
      text: `Hola ${r.guest_name.split(" ")[0]},

Revisamos el comprobante de tu reserva ${codigo} y no pudimos validarlo.${motivo ? `\n\nMotivo: ${motivo}` : ""}

Tranquilo: tus fechas siguen apartadas por unas horas. Verifica los datos de la transferencia y vuelve a subir el comprobante desde la página de reserva, o si prefieres paga con tarjeta. ¿Dudas? Escríbenos por WhatsApp y lo resolvemos juntos.`,
      metaLine: `Reserva ${codigo} · ${r.check_in} → ${r.check_out}`,
    }).catch((e) => console.error("[decision] email rechazo:", e));
    logAudit(db, {
      actor, action: "rechazar_comprobante", entity: "reservation", entityId: id,
      detail: { codigo, motivo: motivo ?? null },
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'action debe ser "confirmar" o "rechazar"' }, { status: 400 });
}
