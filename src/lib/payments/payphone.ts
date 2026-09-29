import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hasDeposit } from "@/lib/payments/status";
import type {
  PaymentInstructions,
  PaymentIntentInput,
  PaymentProvider,
  WebhookEvent,
} from "./types";
import { optionalEnv } from "@/lib/env";

/**
 * Payphone — CAJITA DE PAGOS embebida (docs.payphone.app → "Cajita de pagos").
 *
 * Flujo:
 * 1. preparePayphoneBox() registra el intento en `payments` y devuelve los
 *    parámetros de la cajita (monto en CENTAVOS, clientTransactionId ≤15,
 *    reference, storeId). El cliente la renderiza con PPaymentButtonBox y
 *    NEXT_PUBLIC_PAYPHONE_TOKEN (credencial pública por diseño de Payphone).
 * 2. Tras el pago, Payphone redirige a la "URL de respuesta" configurada en
 *    Payphone Developer (GET /api/payphone/respuesta?id=&clientTransactionId=).
 * 3. resolveBoxReturn() CONFIRMA la transacción server-side con el token de
 *    SERVIDOR (PAYPHONE_TOKEN — jamás viaja al browser). Sin confirmación en
 *    los primeros 5 minutos, Payphone REVERSA el pago automáticamente.
 *    statusCode 3 = Aprobada · 2 = Cancelada.
 *
 * Payphone no firma el retorno: la verificación ES re-consultar la
 * transacción con tu token contra su API.
 */

const LINKS_URL = "https://pay.payphonetodoesposible.com/api/Links";
// Confirmación de la cajita v2. La del botón clásico por redirección es
// https://pay.payphonetodoesposible.com/api/button/V2/Confirm (mismo body);
// se puede forzar con PAYPHONE_CONFIRM_URL si tu app usa esa variante.
const CONFIRM_URL_DEFAULT = "https://paymentbox.payphonetodoesposible.com/api/confirm";

const APPROVED_STATUS_CODE = 3;

function confirmUrl(): string {
  return process.env.PAYPHONE_CONFIRM_URL ?? CONFIRM_URL_DEFAULT;
}

/** Token de SERVIDOR (Confirm + Links). Nunca exponer al browser. */
function serverToken(): string {
  const t = optionalEnv("PAYPHONE_TOKEN");
  if (!t) throw new Error("PAYPHONE_TOKEN is not set (see .env.example)");
  return t;
}

/**
 * Store de Payphone — OPCIONAL: el portal no expone el storeId y su API no
 * tiene endpoint de listado (verificado: /api/Stores y variantes → 404).
 * Sin storeId, Payphone usa la tienda DEFAULT de la aplicación, que es lo
 * que queremos (una sola tienda). Si algún día consiguen el id real
 * (Payphone Developer → Solicitud de compañía → "Listado de tiendas"),
 * basta setear PAYPHONE_STORE_ID.
 */
function storeIdOrNull(): string | null {
  return optionalEnv("PAYPHONE_STORE_ID") || null;
}

/**
 * Id de transacción nuestro: PREFIJO + 8 del uuid + "-" + 4 aleatorios =
 * 15 chars (límite del API de Links; único por INTENTO para que un
 * reintento de pago no choque con el anterior).
 * Prefijos: "CB" = reserva · "SN" = orden de snacks — el endpoint de
 * respuesta rutea por este prefijo.
 */
export function newClientTransactionId(id: string, prefix: "CB" | "SN" = "CB"): string {
  const short = id.replace(/-/g, "").slice(0, 8).toUpperCase();
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let rand = "";
  for (let i = 0; i < 4; i++) {
    rand += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${prefix}${short}-${rand}`;
}

/** ¿El retorno de la cajita corresponde a una orden de snacks? */
export const isSnackCtid = (ctid: string | null): boolean => !!ctid && ctid.startsWith("SN");

export type PayphoneConfirmResult = {
  httpOk: boolean;
  approved: boolean;
  statusCode: number | null;       // 3 = Aprobada, 2 = Cancelada
  transactionStatus: string | null;
  transactionId: string | null;
  amount: number | null;           // centavos, según Payphone
  email: string | null;            // datos del pagador que entrega Payphone
  phoneNumber: string | null;      // (la cajita los pide al pagar)
  raw: unknown;
};

/**
 * POST de CONFIRMACIÓN contra Payphone (server-side, Bearer del servidor).
 * Obligatorio dentro de los 5 minutos post-pago o Payphone reversa.
 */
export async function confirmPayphoneTransaction(
  id: number,
  clientTxId: string
): Promise<PayphoneConfirmResult> {
  const res = await fetch(confirmUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, clientTxId }),
    cache: "no-store",
  });
  const raw: unknown = await res.json().catch(() => ({}));
  const r = raw as Record<string, unknown>;
  const statusCode = typeof r.statusCode === "number" ? r.statusCode : null;
  return {
    httpOk: res.ok,
    approved: res.ok && statusCode === APPROVED_STATUS_CODE,
    statusCode,
    transactionStatus: typeof r.transactionStatus === "string" ? r.transactionStatus : null,
    transactionId: r.transactionId != null ? String(r.transactionId) : null,
    amount: typeof r.amount === "number" ? r.amount : null,
    email: typeof r.email === "string" && r.email ? r.email : null,
    phoneNumber: typeof r.phoneNumber === "string" && r.phoneNumber ? r.phoneNumber : null,
    raw,
  };
}

/**
 * Registra el intento en `payments` y devuelve los parámetros de la cajita.
 * Sirve para RESERVAS (reservationId, ctid "CB…") y para ÓRDENES DE SNACKS
 * (snackOrderId, ctid "SN…"). El monto SIEMPRE sale de la DB — nunca del
 * cliente. Reintenta una vez si el clientTransactionId aleatorio colisiona.
 */
export async function preparePayphoneBox(args: {
  reservationId?: string;
  snackOrderId?: string;
  amountCents: number;
  reference: string;
}): Promise<PaymentInstructions> {
  if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) {
    throw new Error("Monto inválido para la cajita de pagos");
  }
  const subjectId = args.reservationId ?? args.snackOrderId;
  if (!subjectId) throw new Error("preparePayphoneBox requiere reservationId o snackOrderId");
  const prefix = args.reservationId ? "CB" : "SN";
  const reference = args.reference.slice(0, 100);
  const db = supabaseAdmin();

  let clientTransactionId = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    clientTransactionId = newClientTransactionId(subjectId, prefix);
    const { error } = await db.from("payments").insert({
      reservation_id: args.reservationId ?? null,
      snack_order_id: args.snackOrderId ?? null,
      provider: "payphone",
      method: "box",
      amount_cents: args.amountCents,
      currency: "USD",
      status: "initiated",
      client_transaction_id: clientTransactionId,
    });
    if (!error) break;
    if (error.code !== "23505" || attempt === 1) {
      throw new Error(`No se pudo registrar el intento de pago: ${error.message}`);
    }
  }

  const storeId = storeIdOrNull();
  return {
    provider: "payphone",
    kind: "embedded_box",
    box: {
      amount: args.amountCents,
      clientTransactionId,
      reference,
      ...(storeId ? { storeId } : {}),
    },
  };
}

export type BoxReturnResolution =
  | { kind: "invalid" }                                  // faltan parámetros
  | { kind: "unknown" }                                  // clientTransactionId no registrado
  | { kind: "already_approved"; reservationId: string }  // recarga del retorno: nada que hacer
  | { kind: "approved"; reservationId: string; event: WebhookEvent }
  | { kind: "rejected"; reservationId: string }
  // la reserva ya no admite este cobro (pagada por otro medio o cancelada):
  // NO se confirma y Payphone lo reversa solo en ~5 min
  | { kind: "stale"; reservationId: string; reason: "paid" | "cancelled" }
  | { kind: "error"; reservationId: string | null };

/**
 * Resuelve el retorno de la cajita (?id=&clientTransactionId=):
 * busca el intento en `payments`, confirma contra Payphone y deja el intento
 * auditado (approved/rejected/error + raw_response). Idempotente: un retorno
 * repetido de un intento ya aprobado no vuelve a confirmar ni a tocar nada.
 */
export async function resolveBoxReturn(params: {
  id: string | null;
  clientTransactionId: string | null;
}): Promise<BoxReturnResolution> {
  const txId = Number(params.id);
  const clientTxId = params.clientTransactionId ?? "";
  if (!Number.isInteger(txId) || txId <= 0 || !clientTxId || clientTxId.length > 15) {
    return { kind: "invalid" };
  }

  const db = supabaseAdmin();
  const { data: payment } = await db
    .from("payments")
    .select("id, reservation_id, amount_cents, status")
    .eq("provider", "payphone")
    .eq("client_transaction_id", clientTxId)
    .single();
  if (!payment) return { kind: "unknown" };

  if (payment.status === "approved") {
    return { kind: "already_approved", reservationId: payment.reservation_id };
  }

  // Estado ACTUAL de la reserva ANTES de confirmar: confirmar = CAPTURAR el
  // cobro (sin Confirm, Payphone lo reversa solo en ~5 min). Si la reserva ya
  // está pagada (otro intento en paralelo, transferencia confirmada) o ya no
  // está pending (cancelada/expirada), NO capturamos: evita el doble cobro
  // firme y el cobro de reservas muertas.
  const { data: resv } = await db
    .from("reservations")
    .select("status, payment_status")
    .eq("id", payment.reservation_id)
    .single();
  if (!resv) {
    console.error(`[payphone] intento ${clientTxId} sin reserva ${payment.reservation_id}`);
    return { kind: "error", reservationId: payment.reservation_id };
  }
  if (hasDeposit(resv.payment_status) || resv.status === "confirmed") {
    console.error(
      `[payphone] intento ${clientTxId} sobre reserva ya pagada: no se confirma (Payphone reversa solo)`
    );
    await db.from("payments").update({
      status: "rejected",
      raw_response: {
        skipped_confirm: true,
        reason: "reserva ya pagada por otro medio; sin Confirm, Payphone reversa este cobro",
        payphone_tx_id: txId,
      },
    }).eq("id", payment.id);
    return { kind: "stale", reservationId: payment.reservation_id, reason: "paid" };
  }
  if (resv.status !== "pending") {
    await db.from("payments").update({
      status: "rejected",
      raw_response: {
        skipped_confirm: true,
        reason: `reserva ${resv.status}; sin Confirm, Payphone reversa este cobro`,
        payphone_tx_id: txId,
      },
    }).eq("id", payment.id);
    return { kind: "stale", reservationId: payment.reservation_id, reason: "cancelled" };
  }

  let confirm: PayphoneConfirmResult;
  try {
    confirm = await confirmPayphoneTransaction(txId, clientTxId);
  } catch (e) {
    console.error("[payphone] confirm falló:", (e as Error).message);
    return { kind: "error", reservationId: payment.reservation_id };
  }

  if (confirm.approved) {
    // defensa: el monto aprobado debe ser exactamente el del intento
    if (confirm.amount !== null && confirm.amount !== payment.amount_cents) {
      console.error(
        `[payphone] monto no coincide: esperado ${payment.amount_cents}, Payphone ${confirm.amount} (${clientTxId})`
      );
      await db.from("payments").update({
        status: "error",
        transaction_id: confirm.transactionId,
        raw_response: confirm.raw,
      }).eq("id", payment.id);
      return { kind: "error", reservationId: payment.reservation_id };
    }

    await db.from("payments").update({
      status: "approved",
      transaction_id: confirm.transactionId,
      raw_response: confirm.raw,
      confirmed_at: new Date().toISOString(),
    }).eq("id", payment.id);

    return {
      kind: "approved",
      reservationId: payment.reservation_id,
      event: {
        // idempotencia en payment_events: un evento por transacción de Payphone
        eventId: `box:${confirm.transactionId ?? clientTxId}`,
        reservationId: payment.reservation_id,
        type: "payment.succeeded",
        providerRef: confirm.transactionId ?? undefined,
        raw: confirm.raw,
      },
    };
  }

  // no aprobada (cancelada/rechazada): la reserva sigue pending_payment
  // (status 'pending' + payment_status 'unpaid') y el huésped puede reintentar
  await db.from("payments").update({
    status: confirm.httpOk ? "rejected" : "error",
    transaction_id: confirm.transactionId,
    raw_response: confirm.raw,
  }).eq("id", payment.id);

  return confirm.httpOk
    ? { kind: "rejected", reservationId: payment.reservation_id }
    : { kind: "error", reservationId: payment.reservation_id };
}

/**
 * Link de pago de Payphone (cobro del saldo y cobros por WhatsApp).
 * POST /api/Links con el token de SERVIDOR; oneTime; expira en
 * opts.expireIn horas (default 48; el saldo usa 72). Registra el intento
 * en `payments` (method 'link') y devuelve {link, clientTransactionId} —
 * el ctid permite VERIFICAR el pago después vía GET /api/Sale/client/{ctid}.
 */
export async function generatePaymentLink(
  amountCents: number,
  reference: string,
  reservationId: string,
  opts: { expireIn?: number } = {}
): Promise<{ link: string; clientTransactionId: string }> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("amountCents debe ser un entero positivo (centavos)");
  }

  // El intento se registra ANTES de pedir el link: un link vivo de 48 h jamás
  // debe existir sin su fila de auditoría (el retorno con un ctid desconocido
  // sería inconfirmable). Retry si el ctid aleatorio colisiona.
  const db = supabaseAdmin();
  let clientTransactionId = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    clientTransactionId = newClientTransactionId(reservationId);
    const { error } = await db.from("payments").insert({
      reservation_id: reservationId,
      provider: "payphone",
      method: "link",
      amount_cents: amountCents,
      currency: "USD",
      status: "initiated",
      client_transaction_id: clientTransactionId,
    });
    if (!error) break;
    if (error.code !== "23505" || attempt === 1) {
      throw new Error(`No se pudo registrar el intento de pago: ${error.message}`);
    }
  }

  const markError = (detail: string) =>
    db.from("payments")
      .update({ status: "error", raw_response: { error: detail.slice(0, 300) } })
      .eq("client_transaction_id", clientTransactionId);

  let text: string;
  let httpStatus: number;
  let httpOk: boolean;
  try {
    const res = await fetch(LINKS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountCents,
        amountWithoutTax: amountCents,
        currency: "USD",
        clientTransactionId,
        reference: reference.slice(0, 100),
        oneTime: true,
        expireIn: opts.expireIn ?? 48,
        ...(storeIdOrNull() ? { storeId: storeIdOrNull() } : {}),
      }),
      cache: "no-store",
    });
    text = await res.text();
    httpStatus = res.status;
    httpOk = res.ok;
  } catch (e) {
    await markError((e as Error).message);
    throw e;
  }

  if (!httpOk) {
    await markError(text);
    throw new Error(`Payphone Links ${httpStatus}: ${text.slice(0, 300)}`);
  }
  // la respuesta es la URL del link (a veces como string JSON entre comillas)
  const link = text.trim().replace(/^"|"$/g, "");
  if (!/^https?:\/\//.test(link)) {
    await markError(text);
    throw new Error(`Respuesta inesperada de Payphone Links: ${text.slice(0, 300)}`);
  }

  const { error } = await db
    .from("payments")
    .update({ raw_response: { link } })
    .eq("client_transaction_id", clientTransactionId);
  if (error) console.error("[payphone] no se pudo guardar el link:", error.message);

  return { link, clientTransactionId };
}

/**
 * Consulta el estado de una transacción por nuestro clientTransactionId
 * (GET /api/Sale/client/{ctid}). Los links NO notifican solos: esta es la
 * verificación del pago del saldo (botón del admin + chequeo del cron).
 */
export async function queryTransactionByCtid(clientTxId: string): Promise<PayphoneConfirmResult> {
  const res = await fetch(
    `https://pay.payphonetodoesposible.com/api/Sale/client/${encodeURIComponent(clientTxId)}`,
    {
      headers: { Authorization: `Bearer ${serverToken()}` },
      cache: "no-store",
    }
  );
  const raw: unknown = await res.json().catch(() => ({}));
  // puede devolver una transacción o una lista; tomamos la aprobada si existe
  const list = Array.isArray(raw) ? raw : [raw];
  const hit =
    (list.find((t) => t && (t as Record<string, unknown>).statusCode === APPROVED_STATUS_CODE) ??
      list[0] ??
      {}) as Record<string, unknown>;
  const statusCode = typeof hit.statusCode === "number" ? hit.statusCode : null;
  return {
    httpOk: res.ok,
    approved: res.ok && statusCode === APPROVED_STATUS_CODE,
    statusCode,
    transactionStatus: typeof hit.transactionStatus === "string" ? hit.transactionStatus : null,
    transactionId: hit.transactionId != null ? String(hit.transactionId) : null,
    amount: typeof hit.amount === "number" ? hit.amount : null,
    email: typeof hit.email === "string" && hit.email ? hit.email : null,
    phoneNumber: typeof hit.phoneNumber === "string" && hit.phoneNumber ? hit.phoneNumber : null,
    raw,
  };
}

export class PayPhoneProvider implements PaymentProvider {
  readonly name = "payphone";

  /** Cajita embebida para el anticipo (input.amount llega en DÓLARES). */
  async createPayment(input: PaymentIntentInput): Promise<PaymentInstructions> {
    return preparePayphoneBox({
      reservationId: input.reservationId,
      amountCents: Math.round(input.amount * 100),
      reference: input.description,
    });
  }

  /**
   * "Webhook" de Payphone = el retorno de la cajita. No hay firma: la
   * verificación es la CONFIRMACIÓN server-side contra su API.
   */
  async verifyAndParseWebhook(
    req: NextRequest,
    _rawBody: string
  ): Promise<WebhookEvent | null> {
    const sp = req.nextUrl.searchParams;
    const result = await resolveBoxReturn({
      id: sp.get("id"),
      clientTransactionId: sp.get("clientTransactionId"),
    });
    if (result.kind === "approved") return result.event;
    if (result.kind === "rejected") {
      return {
        eventId: `box:rejected:${sp.get("clientTransactionId")}`,
        reservationId: result.reservationId,
        type: "payment.failed",
        raw: null,
      };
    }
    return null;
  }
}
