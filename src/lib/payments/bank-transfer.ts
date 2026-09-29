import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import type {
  PaymentInstructions,
  PaymentIntentInput,
  PaymentProvider,
  WebhookEvent,
} from "./types";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getBanco } from "@/lib/panel";
import { SITE } from "@/config/site.config";

/**
 * Provider ACTIVO: anticipo por transferencia bancaria.
 * - createPayment → devuelve los datos bancarios + referencia + ruta de Storage
 *   donde el huésped sube el comprobante (bucket 'payment-proofs').
 * - El admin confirma manualmente desde PATCH /api/admin/reservations/[id].
 * - El "webhook" de este provider es interno: lo dispara el propio panel admin
 *   al confirmar (firmado con INTERNAL_WEBHOOK_SECRET), de modo que el flujo
 *   de confirmación + correos es idéntico al de un provider real.
 */
export class BankTransferProvider implements PaymentProvider {
  readonly name = "bank_transfer";

  async createPayment(input: PaymentIntentInput): Promise<PaymentInstructions> {
    const reference = `${SITE.bookingCodePrefix}-${input.reservationId.slice(0, 8).toUpperCase()}`;
    // cuenta editable desde el panel (módulo F); getBanco cae a env si no hay override
    let banco;
    try {
      banco = await getBanco(supabaseAdmin());
    } catch {
      banco = {
        bank_name: process.env.BANK_NAME ?? "",
        account_type: process.env.BANK_ACCOUNT_TYPE ?? "",
        account_number: process.env.BANK_ACCOUNT_NUMBER ?? "",
        account_holder: process.env.BANK_ACCOUNT_HOLDER ?? "",
        holder_id: process.env.BANK_HOLDER_ID ?? "",
      };
    }
    return {
      provider: this.name,
      kind: "manual_instructions",
      instructions: {
        ...banco,
        amount: input.amount,
        reference,
        proof_upload_bucket: "payment-proofs",
        proof_upload_path: `${input.reservationId}/`,
      },
    };
  }

  async verifyAndParseWebhook(
    req: NextRequest,
    rawBody: string
  ): Promise<WebhookEvent | null> {
    const secret = process.env.INTERNAL_WEBHOOK_SECRET;
    if (!secret) throw new Error("INTERNAL_WEBHOOK_SECRET is not set (see .env.example)");

    const signature = req.headers.get("x-webhook-signature") ?? "";
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new Error("Firma de webhook inválida");
    }

    const body = JSON.parse(rawBody) as {
      event_id?: string;
      reservation_id?: string;
      type?: string;
      provider_ref?: string;
    };
    if (!body.event_id || !body.reservation_id) return null;

    return {
      eventId: body.event_id,
      reservationId: body.reservation_id,
      type: body.type === "payment.succeeded" ? "payment.succeeded" : "unknown",
      providerRef: body.provider_ref,
      raw: body,
    };
  }
}

/** Firma un payload para el webhook interno (usado por el panel admin). */
export function signInternalWebhook(rawBody: string): string {
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!secret) throw new Error("INTERNAL_WEBHOOK_SECRET is not set (see .env.example)");
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}
