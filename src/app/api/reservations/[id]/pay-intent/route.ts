import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hasDeposit } from "@/lib/payments/status";
import { BankTransferProvider } from "@/lib/payments/bank-transfer";
import { preparePayphoneBox } from "@/lib/payments/payphone";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PayIntentMethod = "bank_transfer" | "payphone_box";

/**
 * POST /api/reservations/[id]/pay-intent — inicia el pago del anticipo con el
 * método que eligió el huésped, SIN redirigir (la UI decide qué renderizar):
 *
 * - bank_transfer  → devuelve las instrucciones bancarias (datos de cuenta,
 *   referencia y ruta de Storage para subir el comprobante).
 * - payphone_box   → registra el intento en `payments` y devuelve los
 *   parámetros de la cajita embebida de Payphone (monto en CENTAVOS,
 *   clientTransactionId, reference, storeId). El cliente la renderiza con
 *   PPaymentButtonBox + NEXT_PUBLIC_PAYPHONE_TOKEN; al terminar, Payphone
 *   redirige a GET /api/payphone/respuesta, que confirma server-side.
 *
 * El monto SIEMPRE sale de la DB (deposit_amount de la reserva) — jamás del
 * body. Solo se puede pagar una reserva en estado 'pending'.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Reserva inválida" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { method?: string } | null;
  const method = body?.method;
  if (method !== "bank_transfer" && method !== "payphone_box") {
    return NextResponse.json({ error: "Método de pago inválido" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: r } = await db
    .from("reservations")
    .select("id, status, payment_status, deposit_amount, check_in, check_out, guest_name, guest_email, properties(name)")
    .eq("id", id)
    .single();

  if (!r) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }
  if (r.status === "confirmed" && hasDeposit(r.payment_status)) {
    return NextResponse.json({ error: "La reserva ya está pagada" }, { status: 409 });
  }
  if (r.status !== "pending") {
    // cancelada/expirada → ya no hay nada que pagar
    return NextResponse.json({ error: "La reserva expiró o fue cancelada" }, { status: 410 });
  }

  if ((method as PayIntentMethod) === "bank_transfer") {
    const property = Array.isArray(r.properties) ? r.properties[0] : r.properties;
    const payment = await new BankTransferProvider().createPayment({
      reservationId: r.id,
      amount: Number(r.deposit_amount),
      currency: "USD",
      guestName: r.guest_name,
      guestEmail: r.guest_email,
      description: `Anticipo reserva ${property?.name ?? "${SITE.name}"} ${r.check_in} → ${r.check_out}`,
    });
    return NextResponse.json({ payment });
  }

  // payphone_box: la cajita trabaja en CENTAVOS
  try {
    const payment = await preparePayphoneBox({
      reservationId: r.id,
      amountCents: Math.round(Number(r.deposit_amount) * 100),
      reference: `Reserva ${SITE.name} ${r.check_in} al ${r.check_out}`,
    });
    return NextResponse.json({ payment });
  } catch (e) {
    // típicamente PAYPHONE_STORE_ID ausente o fallo registrando el intento
    console.error("[pay-intent] no se pudo preparar la cajita de Payphone:", e);
    return NextResponse.json(
      { error: "Pago con tarjeta no disponible por ahora" },
      { status: 503 }
    );
  }
}
