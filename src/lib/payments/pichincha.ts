import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  PaymentInstructions,
  PaymentIntentInput,
  PaymentProvider,
  WebhookEvent,
} from "./types";
import { optionalEnv } from "@/lib/env";

/* ============================================================
   Banco Pichincha (botón de pagos / Deuna) — redirección + callback.
   Arquitectura:
   - createPayment crea la orden de cobro con referencia = reservationId
     (clientTransactionId) y devuelve la URL de redirección al banco.
   - El banco devuelve al usuario vía GET al callback (y/o notifica por
     POST). NUNCA se confía en los params del redirect: en modo real se
     re-verifica la transacción servidor-a-servidor con las credenciales
     del comercio y se valida que el monto coincida con el anticipo.
   - Modo STUB (PICHINCHA_STUB_MODE=true): simulador local de gateway
     firmado con HMAC para probar el flujo end-to-end sin credenciales.
   ============================================================ */

const stubMode = () => process.env.PICHINCHA_STUB_MODE === "true";
const baseUrl = () => process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

function stubSign(payload: string): string {
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!secret) throw new Error("INTERNAL_WEBHOOK_SECRET is not set (see .env.example)");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export class PichinchaProvider implements PaymentProvider {
  readonly name = "pichincha";

  async createPayment(input: PaymentIntentInput): Promise<PaymentInstructions> {
    if (stubMode()) {
      // Simulador local (modo simulador): URL firmada para que
      // el simulador no pueda inventar montos ni reservas.
      const qs = new URLSearchParams({
        rid: input.reservationId,
        amount: input.amount.toFixed(2),
        desc: input.description,
      });
      qs.set("sig", stubSign(`${input.reservationId}|${input.amount.toFixed(2)}`));
      return {
        provider: this.name,
        kind: "redirect",
        redirect_url: `${baseUrl()}/pago/simulador?${qs.toString()}`,
      };
    }

    // ── Modo real: crear orden de cobro en el API del banco ──
    const apiUrl = optionalEnv("PICHINCHA_API_URL");
    const apiKey = optionalEnv("PICHINCHA_API_KEY");
    const apiSecret = optionalEnv("PICHINCHA_API_SECRET");
    const posId = optionalEnv("PICHINCHA_POS_ID");
    if (!apiUrl || !apiKey || !apiSecret || !posId) {
      throw new Error(
        "Bank gateway not configured: set PICHINCHA_API_URL / PICHINCHA_API_KEY / PICHINCHA_API_SECRET / PICHINCHA_POS_ID (see .env.example)"
      );
    }

    // TODO(credenciales): ajustar al contrato exacto del comercio cuando
    // lleguen las llaves (API de cobros Deuna / botón de pagos Pichincha).
    // El cuerpo de abajo sigue el flujo estándar "payment request":
    const res = await fetch(`${apiUrl}/merchants/transaction/v2/payment-request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "x-api-secret": apiSecret,
      },
      body: JSON.stringify({
        pointOfSale: posId,
        orderId: input.reservationId,            // referencia = reserva
        amount: input.amount,
        currency: input.currency,
        detail: input.description,
        callbackUrl: `${baseUrl()}/api/payments/pichincha/callback`,
        format: "2", // link de pago / checkout web
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`Pichincha payment-request falló: HTTP ${res.status}`);
    }
    const data = await res.json();
    const redirect = data.paymentUrl ?? data.deeplink ?? data.url;
    if (!redirect) throw new Error("Pichincha no devolvió URL de pago");

    return { provider: this.name, kind: "redirect", redirect_url: redirect };
  }

  /**
   * Verifica el retorno/notificación del banco.
   * Acepta GET (callback de redirección) y POST (notificación), igual que
   * el retorno de Payphone. Devuelve el evento listo para el procesador
   * idempotente.
   */
  async verifyAndParseWebhook(
    req: NextRequest,
    rawBody: string
  ): Promise<WebhookEvent | null> {
    // params de query (GET) o body (POST)
    let params: Record<string, string> = {};
    req.nextUrl.searchParams.forEach((v, k) => { params[k] = v; });
    if (rawBody) {
      try { params = { ...JSON.parse(rawBody), ...params }; } catch { /* GET sin body */ }
    }

    const reservationId = params.rid ?? params.orderId ?? params.clientTransactionId ?? "";
    const txId = params.tx ?? params.transactionId ?? params.id ?? "";
    if (!reservationId || !txId) return null;

    if (stubMode()) {
      // El simulador firma rid|tx|status — sin firma válida no hay evento.
      const expected = stubSign(`${reservationId}|${txId}|${params.status ?? ""}`);
      if (!safeEqual(params.sig ?? "", expected)) {
        throw new Error("Firma del simulador inválida");
      }
      return {
        eventId: txId,
        reservationId,
        type: params.status === "approved" ? "payment.succeeded" : "payment.failed",
        providerRef: txId,
        raw: params,
      };
    }

    // ── Modo real: verificación servidor-a-servidor (patrón recomendado:
    //    jamás confiar en el redirect; consultar la transacción al banco) ──
    const apiUrl = optionalEnv("PICHINCHA_API_URL");
    const apiKey = optionalEnv("PICHINCHA_API_KEY");
    const apiSecret = optionalEnv("PICHINCHA_API_SECRET");
    if (!apiUrl || !apiKey || !apiSecret) throw new Error("Bank gateway not configured (see .env.example)");

    // TODO(credenciales): endpoint exacto de consulta de estado del comercio.
    const res = await fetch(`${apiUrl}/merchants/transaction/v2/status/${txId}`, {
      headers: { "x-api-key": apiKey, "x-api-secret": apiSecret },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Pichincha status falló: HTTP ${res.status}`);
    const tx = await res.json();

    // estado aprobado (ajustar al contrato real: status/statusCode)
    const approved = tx.status === "APPROVED" || tx.status === "SUCCESS" || tx.statusCode === 3;

    // el monto reportado debe coincidir con el anticipo de la reserva
    const { data: reservation } = await supabaseAdmin()
      .from("reservations")
      .select("deposit_amount")
      .eq("id", reservationId)
      .single();
    if (!reservation) return null;
    const amountOk =
      Math.abs(Number(tx.amount ?? 0) - Number(reservation.deposit_amount)) < 0.01;
    if (approved && !amountOk) {
      console.error(
        `[pichincha] monto no coincide: tx=${tx.amount} esperado=${reservation.deposit_amount}`
      );
      return { eventId: txId, reservationId, type: "unknown", providerRef: txId, raw: tx };
    }

    return {
      eventId: txId,
      reservationId,
      type: approved ? "payment.succeeded" : "payment.failed",
      providerRef: txId,
      raw: tx,
    };
  }
}
