import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ensureBalanceLink, markBalancePaid, verifyBalancePayment, code } from "@/lib/balance";
import { isFullyPaid } from "@/lib/payments/status";
import { sendBrandedEmail } from "@/lib/notifications/email";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reservations/[id]/balance — gestión del saldo (Etapa 17).
 * Body: { action: "verify" | "send_link" | "mark_paid",
 *         method?: "cash" | "transfer", registered_by?: string }
 * - verify    → consulta Payphone por el link emitido; si está pagado cierra.
 * - send_link → genera/reusa el link de 72h y se lo envía al huésped (modo
 *               BALANCE_DUE_TIMING=manual, o cuando la dueña quiera).
 * - mark_paid → "pagado en efectivo/transferencia al check-in" (con quién
 *               lo registró). Con anticipo 100% no hay saldo: 409.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  let body: { action?: string; method?: "cash" | "transfer"; registered_by?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: r } = await db
    .from("reservations")
    .select("id, status, payment_status, balance_due_cents, guest_name, guest_email, check_in, check_out")
    .eq("id", id)
    .single();
  if (!r) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  if (r.status !== "confirmed") {
    return NextResponse.json({ error: "La reserva no está confirmada" }, { status: 409 });
  }
  if (isFullyPaid(r.payment_status) || (r.balance_due_cents ?? 0) <= 0) {
    return NextResponse.json({ error: "La reserva no tiene saldo pendiente" }, { status: 409 });
  }

  switch (body.action) {
    case "verify": {
      const result = await verifyBalancePayment(db, id);
      return NextResponse.json(result);
    }

    case "send_link": {
      const link = await ensureBalanceLink(db, r);
      if (!link) return NextResponse.json({ error: "No se pudo generar el link" }, { status: 500 });
      const saldo = `$${((r.balance_due_cents ?? 0) / 100).toFixed(2)}`;
      await sendBrandedEmail({
        to: r.guest_email,
        subject: `Tu saldo pendiente · ${code(r.id)} · ${SITE.name}`,
        text: `Hola ${r.guest_name.split(" ")[0]},

Tu saldo pendiente de la reserva ${code(r.id)} (${r.check_in} → ${r.check_out}) es ${saldo}.

Puedes pagarlo aquí (el link expira en 72 horas):
${link.link}

O si prefieres, en efectivo al llegar. ¡Nos vemos pronto!`,
        metaLine: `Reserva ${code(r.id)} · ${r.check_in} → ${r.check_out}`,
      }).catch((e) => console.error("[balance] email link:", e));
      return NextResponse.json({ ok: true, link: link.link });
    }

    case "mark_paid": {
      if (body.method !== "cash" && body.method !== "transfer") {
        return NextResponse.json({ error: 'method debe ser "cash" o "transfer"' }, { status: 400 });
      }
      const result = await markBalancePaid(db, id, {
        method: body.method,
        registeredBy: body.registered_by ?? (auth as { email?: string }).email ?? "admin",
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
      return NextResponse.json({ ok: true, already: result.already ?? false });
    }

    default:
      return NextResponse.json(
        { error: 'action debe ser "verify", "send_link" o "mark_paid"' },
        { status: 400 }
      );
  }
}
