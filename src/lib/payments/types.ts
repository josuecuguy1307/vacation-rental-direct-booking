import type { NextRequest } from "next/server";

/** Datos mínimos de la reserva que un provider necesita para iniciar el cobro. */
export type PaymentIntentInput = {
  reservationId: string;
  amount: number;          // monto del anticipo (deposit_amount), recalculado en servidor
  currency: string;        // 'USD'
  guestName: string;
  guestEmail: string;
  description: string;
};

/**
 * Lo que el frontend necesita para continuar el flujo de pago.
 * - bank_transfer → instrucciones (datos bancarios) + dónde subir comprobante.
 * - pichincha → redirect_url al checkout del provider.
 * - payphone → cajita de pagos EMBEBIDA (box): parámetros para renderizar
 *   PPaymentButtonBox en el cliente. El token de la cajita NO viaja aquí:
 *   el cliente usa NEXT_PUBLIC_PAYPHONE_TOKEN (credencial pública por diseño).
 */
export type PaymentInstructions = {
  provider: string;
  kind: "manual_instructions" | "redirect" | "embedded_box";
  redirect_url?: string;
  box?: {
    amount: number;              // CENTAVOS (Payphone: $100 = 10000)
    clientTransactionId: string; // ≤15 chars, único por intento
    reference: string;
    storeId?: string;            // opcional: sin él, Payphone usa la tienda default
  };
  instructions?: {
    bank_name: string;
    account_type: string;
    account_number: string;
    account_holder: string;
    holder_id: string;
    amount: number;
    reference: string;       // código que el huésped pone en el concepto
    proof_upload_bucket: string;
    proof_upload_path: string;
  };
};

/** Resultado de procesar un webhook ya verificado. */
export type WebhookEvent = {
  eventId: string;           // id único del evento (idempotencia)
  reservationId: string;
  type: "payment.succeeded" | "payment.failed" | "unknown";
  providerRef?: string;      // id de transacción del provider
  raw: unknown;
};

export interface PaymentProvider {
  readonly name: string;

  /** Inicia el cobro del anticipo; devuelve instrucciones o URL de redirección. */
  createPayment(input: PaymentIntentInput): Promise<PaymentInstructions>;

  /**
   * Verifica la firma/autenticidad del webhook y lo parsea.
   * Lanza si la firma es inválida. Devuelve null si el evento no aplica.
   */
  verifyAndParseWebhook(req: NextRequest, rawBody: string): Promise<WebhookEvent | null>;
}
