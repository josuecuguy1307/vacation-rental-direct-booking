import { supabaseAdmin } from "@/lib/supabase/server";
import { confirmReservation } from "@/lib/reservations";
import type { PaymentProvider, WebhookEvent } from "./types";

export type ProcessResult =
  | { outcome: "confirmed" }
  | { outcome: "already_confirmed" }
  | { outcome: "duplicate" }
  | { outcome: "failed" }       // pago rechazado/cancelado → reserva sigue pending
  | { outcome: "ignored" }
  | { outcome: "error"; error: string };

/**
 * Procesamiento idempotente de un evento de pago ya verificado.
 * Lo comparten POST /api/payments/webhook y el callback de redirección
 * de Pichincha: registra en payment_events (unique provider+event_id) y,
 * si procede, confirma la reserva + dispara correos.
 */
export async function processPaymentEvent(
  provider: PaymentProvider,
  event: WebhookEvent
): Promise<ProcessResult> {
  const db = supabaseAdmin();

  const { error: eventErr } = await db.from("payment_events").insert({
    provider: provider.name,
    event_id: event.eventId,
    reservation_id: event.reservationId,
    payload: event.raw,
  });
  if (eventErr) {
    if (eventErr.code === "23505") return { outcome: "duplicate" };
    console.error("[payments] error registrando evento:", eventErr);
    return { outcome: "error", error: "No se pudo registrar el evento" };
  }

  if (event.type === "payment.succeeded") {
    const result = await confirmReservation(event.reservationId, {
      providerRef: event.providerRef,
      paymentMethod: provider.name,
    });
    if (!result.ok) {
      // liberar el evento: si la confirmación falló (error transitorio), un
      // reintento del callback debe poder re-procesarlo en vez de chocar con
      // el unique y quedar como "duplicate" eterno con el cobro ya capturado
      await db
        .from("payment_events")
        .delete()
        .eq("provider", provider.name)
        .eq("event_id", event.eventId);
      return { outcome: "error", error: result.error ?? "Error" };
    }
    return result.alreadyConfirmed
      ? { outcome: "already_confirmed" }
      : { outcome: "confirmed" };
  }

  if (event.type === "payment.failed") return { outcome: "failed" };
  return { outcome: "ignored" };
}
