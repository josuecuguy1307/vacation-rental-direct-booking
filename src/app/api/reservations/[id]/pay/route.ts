import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hasDeposit } from "@/lib/payments/status";
import { getPaymentProvider } from "@/lib/payments";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/reservations/[id]/pay — (re)intenta el pago del anticipo.
 * Genera una orden de cobro nueva con el provider activo y redirige al
 * gateway. Lo usa el flujo normal y el botón "Reintentar pago" tras un
 * pago fallido/cancelado (la reserva sigue pending con las fechas
 * apartadas hasta que expire).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? req.nextUrl.origin;
  if (!UUID_RE.test(id)) {
    return NextResponse.redirect(`${base}/reservar?pago=pendiente`);
  }

  const db = supabaseAdmin();
  const { data: r } = await db
    .from("reservations")
    .select("id, status, payment_status, guest_name, guest_email, deposit_amount, check_in, check_out, properties(name)")
    .eq("id", id)
    .single();

  if (!r) return NextResponse.redirect(`${base}/reservar?pago=pendiente`);
  if (r.status === "confirmed" && hasDeposit(r.payment_status)) {
    return NextResponse.redirect(`${base}/reservar?pago=exito&reserva=${id}`);
  }
  if (r.status !== "pending") {
    // cancelada/expirada → no hay nada que pagar
    return NextResponse.redirect(`${base}/reservar?pago=expirado`);
  }

  try {
    const property = Array.isArray(r.properties) ? r.properties[0] : r.properties;
    const payment = await getPaymentProvider().createPayment({
      reservationId: r.id,
      amount: Number(r.deposit_amount),
      currency: "USD",
      guestName: r.guest_name,
      guestEmail: r.guest_email,
      description: `Anticipo reserva ${property?.name ?? "${SITE.name}"} ${r.check_in} → ${r.check_out}`,
    });
    if (payment.kind === "redirect" && payment.redirect_url) {
      return NextResponse.redirect(payment.redirect_url);
    }
    // provider sin redirección (p.ej. transferencia) → volver al sitio
    return NextResponse.redirect(`${base}/reservar?pago=pendiente&reserva=${id}`);
  } catch (e) {
    console.error("[pay] no se pudo crear el pago:", e);
    return NextResponse.redirect(`${base}/reservar?pago=pendiente&reserva=${id}`);
  }
}
