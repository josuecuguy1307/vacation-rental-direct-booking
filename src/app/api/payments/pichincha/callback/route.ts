import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payments";
import { processPaymentEvent } from "@/lib/payments/process";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Callback de Banco Pichincha — el banco devuelve al usuario aquí (GET)
 * y/o notifica por POST (mismo patrón que el retorno de Payphone).
 * Verifica → procesa idempotente (payment_events) → redirige al sitio
 * con ?pago=exito|fallido|pendiente para que la UI lo muestre.
 */
export async function GET(req: NextRequest) {
  return handleCallback(req, "");
}

export async function POST(req: NextRequest) {
  return handleCallback(req, await req.text());
}

async function handleCallback(req: NextRequest, rawBody: string) {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? req.nextUrl.origin;
  const home = (status: string, rid?: string) =>
    NextResponse.redirect(
      `${base}/reservar?pago=${status}${rid ? `&reserva=${rid}` : ""}`
    );

  const provider = getPaymentProvider("pichincha");

  let event;
  try {
    event = await provider.verifyAndParseWebhook(req, rawBody);
  } catch (e) {
    console.warn("[pichincha:callback] verificación falló:", (e as Error).message);
    return home("pendiente");
  }
  if (!event) return home("pendiente");

  const result = await processPaymentEvent(provider, event);
  switch (result.outcome) {
    case "confirmed":
    case "already_confirmed":
      return home("exito", event.reservationId);
    case "duplicate": {
      // evento repetido (p.ej. recarga del callback): responder según el
      // estado real de la reserva, no según este reintento
      const { data } = await supabaseAdmin()
        .from("reservations")
        .select("status")
        .eq("id", event.reservationId)
        .single();
      return home(data?.status === "confirmed" ? "exito" : "fallido", event.reservationId);
    }
    case "failed":
      // pago rechazado/cancelado → la reserva sigue pending y puede reintentar
      return home("fallido", event.reservationId);
    default:
      console.error("[pichincha:callback]", result);
      return home("pendiente", event.reservationId);
  }
}
