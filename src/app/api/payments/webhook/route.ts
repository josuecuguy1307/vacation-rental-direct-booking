import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payments";
import { processPaymentEvent } from "@/lib/payments/process";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/webhook?provider=bank_transfer|pichincha|payphone
 * Idempotente (unique en payment_events) + verificación de firma del provider.
 * Al confirmar el pago: marca paid/confirmed y dispara correos.
 */
export async function POST(req: NextRequest) {
  const providerName = req.nextUrl.searchParams.get("provider") ?? undefined;
  const rawBody = await req.text();

  let provider;
  try {
    provider = getPaymentProvider(providerName);
  } catch {
    return NextResponse.json({ error: "Provider desconocido" }, { status: 400 });
  }

  // ── Verificar firma + parsear ──────────────────────────
  let event;
  try {
    event = await provider.verifyAndParseWebhook(req, rawBody);
  } catch (e) {
    console.warn(`[webhook:${provider.name}] firma inválida:`, (e as Error).message);
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }
  if (!event) return NextResponse.json({ received: true, ignored: true });

  // ── Procesar (idempotente vía payment_events) ──────────
  const result = await processPaymentEvent(provider, event);
  switch (result.outcome) {
    case "duplicate":
      return NextResponse.json({ received: true, duplicate: true });
    case "error":
      console.error("[webhook] no se pudo procesar:", result.error);
      return NextResponse.json({ error: result.error }, { status: 422 });
    default:
      return NextResponse.json({ received: true, outcome: result.outcome });
  }
}
