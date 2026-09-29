import type { SupabaseClient } from "@supabase/supabase-js";
import { generatePaymentLink, queryTransactionByCtid } from "@/lib/payments/payphone";
import { isFullyPaid } from "@/lib/payments/status";
import { sendBrandedEmail } from "@/lib/notifications/email";
import { notifyOwnerText } from "@/lib/notifications/whatsapp";
import { generateAndStoreReceipt, type ReceiptNight } from "@/lib/pdf/receipt";
import { SITE } from "@/config/site.config";

/* ============================================================
   Pago del SALDO (Etapa 17 — dormido con anticipo 100%).
   balance_due_cents = total − anticipo. Si el anticipo es 100%
   (Etapa 19), el saldo es 0 y todo este circuito no hace nada;
   si DEPOSIT_PERCENT vuelve a <100, revive solo.
   Los links de Payphone NO notifican: la verificación es por
   GET /api/Sale/client/{ctid} (botón admin + chequeo del cron).
   ============================================================ */

const LINK_TTL_HOURS = 72;
const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
export const code = (id: string) => `${SITE.bookingCodePrefix}-${id.slice(0, 8).toUpperCase()}`;

export const balanceTiming = (): "before_checkin" | "manual" =>
  process.env.BALANCE_DUE_TIMING === "manual" ? "manual" : "before_checkin";

/** anticipo + saldo = total, exacto en centavos (testeable). */
export function computeBalanceCents(total: number, deposit: number): number {
  return Math.max(0, Math.round(total * 100) - Math.round(deposit * 100));
}

type BalanceReservation = {
  id: string;
  balance_due_cents: number | null;
  payment_status: string;
  check_in: string;
  check_out: string;
  guest_name: string;
  guest_email: string;
};

/**
 * Link de saldo activo para la reserva: reutiliza el vigente (<72h) o
 * genera uno nuevo (marcando 'expired' los anteriores). null si no hay
 * saldo que cobrar.
 */
export async function ensureBalanceLink(
  db: SupabaseClient,
  r: BalanceReservation
): Promise<{ link: string; clientTransactionId: string } | null> {
  const due = r.balance_due_cents ?? 0;
  if (due <= 0 || isFullyPaid(r.payment_status)) return null;

  const since = new Date(Date.now() - LINK_TTL_HOURS * 3600_000).toISOString();
  const { data: existing } = await db
    .from("payments")
    .select("client_transaction_id, raw_response, created_at")
    .eq("reservation_id", r.id)
    .eq("provider", "payphone")
    .eq("method", "link")
    .eq("status", "initiated")
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const link = (existing?.raw_response as { link?: string } | null)?.link;
  if (existing && link) {
    return { link, clientTransactionId: existing.client_transaction_id };
  }

  // los links viejos quedan auditados como expirados (regenerable)
  await db.from("payments")
    .update({ status: "expired" })
    .eq("reservation_id", r.id)
    .eq("method", "link")
    .eq("status", "initiated");

  return generatePaymentLink(due, `Saldo reserva ${code(r.id)}`, r.id, {
    expireIn: LINK_TTL_HOURS,
  });
}

/**
 * Marca el saldo como pagado (transición atómica deposit_paid → fully_paid:
 * una doble verificación no duplica nada) y dispara el cierre: recibo
 * actualizado PAGADO COMPLETO + email "¡Saldo recibido!" + WA al dueño.
 */
export async function markBalancePaid(
  db: SupabaseClient,
  reservationId: string,
  info: { method: "payphone_link" | "cash" | "transfer"; registeredBy?: string }
): Promise<{ ok: boolean; already?: boolean; error?: string }> {
  const { data: updated, error } = await db
    .from("reservations")
    .update({
      payment_status: "fully_paid",
      balance_paid_at: new Date().toISOString(),
      balance_method: info.method,
      ...(info.registeredBy ? { balance_registered_by: info.registeredBy } : {}),
    })
    .eq("id", reservationId)
    .in("payment_status", ["paid", "deposit_paid"])
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!(updated ?? []).length) return { ok: true, already: true };

  // cierre: recibo actualizado + correos (fuera del camino crítico)
  const { data: r } = await db
    .from("reservations")
    .select("*, properties(name, check_in_time, check_out_time)")
    .eq("id", reservationId)
    .single();
  if (!r) return { ok: true };
  const property = Array.isArray(r.properties) ? r.properties[0] : r.properties;
  const fmtHora = (t: string | null | undefined, fb: string) =>
    t ? String(t).slice(0, 5).replace(":", "h") : fb;

  const garantiaCents = Number(r.garantia_amount_cents ?? 0);
  const petsTotal = Math.max(0, Math.round(
    (Number(r.total) - Number(r.subtotal) -
      Number(r.extras_total) - Number(r.cleaning_fee)) * 100 - garantiaCents
  ) / 100);

  await generateAndStoreReceipt(db, {
    reservationId: r.id,
    guestName: r.guest_name,
    guestEmail: r.guest_email,
    guestDocument: r.guest_document
      ? `${r.guest_document_type === "pasaporte" ? "Pasaporte" : "Cédula"} ${r.guest_document}`
      : null,
    guestCountry: r.guest_country,
    petCount: r.pet_count,
    checkIn: r.check_in,
    checkOut: r.check_out,
    checkInTime: fmtHora(property?.check_in_time, "15h00"),
    checkOutTime: fmtHora(property?.check_out_time, "11h00"),
    guests: r.num_guests,
    nights: r.nights ?? 0,
    nightly: (r.price_breakdown as ReceiptNight[] | null) ?? null,
    lodgingTotal: Number(r.subtotal),
    extrasTotal: Number(r.extras_total),
    petsTotal,
    cleaningFee: Number(r.cleaning_fee),
    guarantee: garantiaCents / 100,
    total: Number(r.total),
    depositPaid: Number(r.total),       // pagado a la fecha = TOTAL
    paymentMethod: r.payment_method ?? "bank_transfer",
    propertyName: property?.name ?? `${SITE.name}`,
    fullyPaid: true,
  });

  const totalCents = Math.round(Number(r.total) * 100);
  const metodo = { payphone_link: "Link de pago Payphone", cash: "Efectivo", transfer: "Transferencia" }[info.method];

  const { data: rec } = r.receipt_path
    ? await db.storage.from("receipts").download(r.receipt_path)
    : { data: null };

  sendBrandedEmail({
    to: r.guest_email,
    subject: `¡Saldo recibido! · ${code(r.id)} · ${SITE.name}`,
    text: `Hola ${r.guest_name.split(" ")[0]},

¡Recibimos el pago de tu saldo! Tu estadía del ${r.check_in} al ${r.check_out} está PAGADA POR COMPLETO (${fmt(totalCents)}).

Adjuntamos tu recibo actualizado. ¡Nos vemos pronto!`,
    attachments: rec
      ? [{ filename: `Recibo-${SITE.slug}.pdf`, content: Buffer.from(await rec.arrayBuffer()) }]
      : undefined,
  }).catch((e) => console.error("[balance] email saldo:", e));

  notifyOwnerText(
    `💵 *${SITE.name} — saldo recibido*\n${code(r.id)} · ${r.guest_name}\n${fmt(totalCents)} pagado COMPLETO · ${metodo}${info.registeredBy ? `\nRegistró: ${info.registeredBy}` : ""}`
  ).catch(() => {});

  return { ok: true };
}

/**
 * Verifica contra Payphone si el link de saldo de la reserva ya fue pagado
 * (lo usan el botón del admin y el cron). Aprobado + monto exacto →
 * markBalancePaid.
 */
export async function verifyBalancePayment(
  db: SupabaseClient,
  reservationId: string
): Promise<{ paid: boolean; detail: string }> {
  const { data: attempts } = await db
    .from("payments")
    .select("id, client_transaction_id, amount_cents, status")
    .eq("reservation_id", reservationId)
    .eq("method", "link")
    .in("status", ["initiated", "expired"])
    .order("created_at", { ascending: false })
    .limit(3);
  if (!(attempts ?? []).length) return { paid: false, detail: "Sin links de saldo emitidos" };

  for (const a of attempts!) {
    const q = await queryTransactionByCtid(a.client_transaction_id);
    if (!q.approved) continue;
    if (q.amount !== null && q.amount !== a.amount_cents) {
      console.error(`[balance] monto no coincide en ${a.client_transaction_id}`);
      continue;
    }
    await db.from("payments").update({
      status: "approved",
      transaction_id: q.transactionId,
      raw_response: q.raw,
      confirmed_at: new Date().toISOString(),
    }).eq("id", a.id);
    await markBalancePaid(db, reservationId, { method: "payphone_link" });
    return { paid: true, detail: `Pago verificado (tx ${q.transactionId})` };
  }
  return { paid: false, detail: "Payphone aún no registra el pago del link" };
}

/** Chequeo automático del cron: links de saldo pendientes de reservas activas. */
export async function checkPendingBalanceLinks(db: SupabaseClient, limit = 10): Promise<number> {
  const { data } = await db
    .from("payments")
    .select("reservation_id, reservations!inner(payment_status, status)")
    .eq("provider", "payphone")
    .eq("method", "link")
    .eq("status", "initiated")
    .not("reservation_id", "is", null)
    .limit(limit);
  let confirmed = 0;
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const rid = row.reservation_id as string;
    if (seen.has(rid)) continue;
    seen.add(rid);
    const resv = Array.isArray(row.reservations) ? row.reservations[0] : row.reservations;
    if (!resv || resv.status !== "confirmed" || isFullyPaid(resv.payment_status)) continue;
    const r = await verifyBalancePayment(db, rid);
    if (r.paid) confirmed++;
  }
  return confirmed;
}
