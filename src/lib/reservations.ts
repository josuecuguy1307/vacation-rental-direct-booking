import { supabaseAdmin } from "@/lib/supabase/server";
import { sendOwnerConfirmationEmail, type ReservationEmailData } from "@/lib/notifications/email";
import { notifyOwnerWhatsApp } from "@/lib/notifications/whatsapp";
import { scheduleGuestMessages } from "@/lib/messaging/schedule";
import { processDueMessages } from "@/lib/messaging/send";
import { generateAndStoreReceipt, type ReceiptNight } from "@/lib/pdf/receipt";
import { hasDeposit } from "@/lib/payments/status";
import { computeBalanceCents } from "@/lib/balance";
import { SITE } from "@/config/site.config";

/**
 * Marca una reserva como pagada + confirmada y dispara el flujo completo:
 * 1. Recibo PDF (Storage privado `receipts`) — recibo, NO factura SRI.
 * 2. Timeline de mensajes al huésped (scheduled_messages, estilo Airbnb).
 * 3. Aviso al dueño (email + WhatsApp con método de pago).
 * 4. Envío inmediato del mensaje de confirmación (el cron cubre el resto).
 *
 * Idempotente: si ya estaba confirmada/pagada no re-envía nada (y el unique
 * de scheduled_messages evita duplicar el timeline en carreras).
 * Lo comparten el webhook de pagos, el retorno de Payphone y el admin.
 */
export async function confirmReservation(
  reservationId: string,
  opts: { providerRef?: string; paymentMethod?: string } = {}
): Promise<{ ok: boolean; alreadyConfirmed?: boolean; error?: string }> {
  const db = supabaseAdmin();

  const { data: existing, error: fetchErr } = await db
    .from("reservations")
    .select("*, properties(name, check_in_time, check_out_time, wifi_name, wifi_password)")
    .eq("id", reservationId)
    .single();

  if (fetchErr || !existing) return { ok: false, error: "Reserva no encontrada" };
  if (existing.status === "cancelled") {
    return { ok: false, error: "La reserva está cancelada" };
  }
  if (existing.status === "confirmed" && hasDeposit(existing.payment_status)) {
    return { ok: true, alreadyConfirmed: true };
  }

  // Etapa 17/19: con anticipo 100% el pago confirma la estadía COMPLETA
  // (fully_paid); con <100% queda deposit_paid y el saldo se cobra después.
  const balanceDue =
    existing.balance_due_cents ??
    computeBalanceCents(Number(existing.total), Number(existing.deposit_amount));
  const fullyPaid = balanceDue <= 0;

  const { error: updateErr } = await db
    .from("reservations")
    .update({
      status: "confirmed",
      payment_status: fullyPaid ? "fully_paid" : "deposit_paid",
      ...(fullyPaid ? { balance_paid_at: new Date().toISOString() } : {}),
      ...(opts.providerRef ? { payment_provider_ref: opts.providerRef } : {}),
      ...(opts.paymentMethod ? { payment_method: opts.paymentMethod } : {}),
    })
    .eq("id", reservationId);

  if (updateErr) return { ok: false, error: updateErr.message };

  const property = Array.isArray(existing.properties) ? existing.properties[0] : existing.properties;
  const paymentMethod = opts.paymentMethod ?? existing.payment_method ?? "bank_transfer";
  const fmtHora = (t: string | null | undefined, fb: string) =>
    t ? String(t).slice(0, 5).replace(":", "h") : fb;

  // garantía + mascotas para el desglose del recibo (derivados de columnas
  // guardadas: total = alojamiento + extras + mascotas + limpieza + garantía)
  const garantiaCents = Number(existing.garantia_amount_cents ?? 0);
  const petsTotal = Math.max(0, Math.round(
    (Number(existing.total) - Number(existing.subtotal) -
      Number(existing.extras_total) - Number(existing.cleaning_fee)) * 100 - garantiaCents
  ) / 100);

  // 1) Recibo PDF — nunca bloquea la confirmación (loguea y sigue)
  await generateAndStoreReceipt(db, {
    reservationId: existing.id,
    guestName: existing.guest_name,
    guestEmail: existing.guest_email,
    guestDocument: existing.guest_document
      ? `${existing.guest_document_type === "pasaporte" ? "Pasaporte" : "Cédula"} ${existing.guest_document}`
      : null,
    guestCountry: existing.guest_country,
    petCount: existing.pet_count,
    checkIn: existing.check_in,
    checkOut: existing.check_out,
    checkInTime: fmtHora(property?.check_in_time, "15h00"),
    checkOutTime: fmtHora(property?.check_out_time, "11h00"),
    guests: existing.num_guests,
    nights: existing.nights ?? 0,
    nightly: (existing.price_breakdown as ReceiptNight[] | null) ?? null,
    lodgingTotal: Number(existing.subtotal),
    extrasTotal: Number(existing.extras_total),
    petsTotal,
    cleaningFee: Number(existing.cleaning_fee),
    guarantee: garantiaCents / 100,
    total: Number(existing.total),
    depositPaid: Number(existing.deposit_amount),
    paymentMethod,
    propertyName: property?.name ?? `${SITE.name}`,
    fullyPaid,
  });

  // 2) Timeline de mensajes al huésped (idempotente por unique)
  await scheduleGuestMessages(db, existing);

  const emailData: ReservationEmailData = {
    id: existing.id,
    guest_name: existing.guest_name,
    guest_email: existing.guest_email,
    check_in: existing.check_in,
    check_out: existing.check_out,
    num_guests: existing.num_guests,
    total: Number(existing.total),
    deposit_amount: Number(existing.deposit_amount),
    property_name: property?.name ?? `${SITE.name}`,
  };

  // 3) Avisos al dueño — fuera del camino crítico: errores se loguean, no bloquean
  await Promise.allSettled([
    sendOwnerConfirmationEmail(emailData),
    notifyOwnerWhatsApp({
      ...emailData,
      guest_phone: existing.guest_phone,
      status: "confirmed",
      payment_method: paymentMethod,
      arrival_time: existing.arrival_time,
      pet_count: existing.pet_count,
      guest_message: existing.guest_message,
      companions: (existing.companions as string[] | null) ?? null,
    }),
  ]);

  // 4) Confirmación inmediata al huésped (el cron de 15 min cubre reintentos)
  try {
    await processDueMessages(db, { reservationId: existing.id, limit: 4 });
  } catch (e) {
    console.error("[reservations] envío inmediato falló (el cron reintenta):", e);
  }

  return { ok: true };
}
