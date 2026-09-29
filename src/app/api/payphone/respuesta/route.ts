import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payments";
import { resolveBoxReturn } from "@/lib/payments/payphone";
import { processPaymentEvent } from "@/lib/payments/process";
import { confirmReservation } from "@/lib/reservations";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hasDeposit } from "@/lib/payments/status";
import { notifyOwnerEvent } from "@/lib/owner-notify";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

/**
 * GET /api/payphone/respuesta — la "URL de respuesta" configurada en Payphone
 * Developer: tras pagar en la cajita, Payphone trae al huésped aquí con
 * ?id=<int>&clientTransactionId=<string>.
 *
 * Payphone NO firma este retorno: la verificación ES la confirmación
 * server-side (resolveBoxReturn re-consulta la transacción con el token de
 * servidor y audita el intento en `payments`). Debe ocurrir dentro de los
 * 5 minutos post-pago o Payphone reversa el cobro automáticamente.
 *
 * Tras resolver, procesa el evento de forma idempotente (payment_events →
 * confirma reserva + correos) y redirige al sitio con
 * ?pago=exito|fallido|pendiente, igual que el callback de Pichincha.
 */
export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? req.nextUrl.origin;
  const home = (status: string, rid?: string) =>
    NextResponse.redirect(
      `${base}/reservar?pago=${status}${rid ? `&reserva=${rid}` : ""}`
    );

  const sp = req.nextUrl.searchParams;
  const ctid = sp.get("clientTransactionId");

  // ── reservas (ctid "CB…") — el cobro de snacks ya no pasa por Payphone ──
  const result = await resolveBoxReturn({
    id: sp.get("id"),
    clientTransactionId: ctid,
  });

  switch (result.kind) {
    case "approved": {
      const outcome = await processPaymentEvent(
        getPaymentProvider("payphone"),
        result.event
      );
      switch (outcome.outcome) {
        case "confirmed":
        case "already_confirmed":
          return home("exito", result.reservationId);
        case "duplicate": {
          // evento repetido (carrera de dos retornos): si la reserva quedó
          // confirmada, listo; si sigue pending con el cobro YA capturado,
          // reparar con confirmReservation (idempotente) en vez de invitar a
          // pagar de nuevo con un redirect "fallido"
          const { data } = await supabaseAdmin()
            .from("reservations")
            .select("status, payment_status")
            .eq("id", result.reservationId)
            .single();
          if (data?.status === "confirmed" && hasDeposit(data?.payment_status)) {
            return home("exito", result.reservationId);
          }
          const repair = await confirmReservation(result.reservationId, {
            paymentMethod: "payphone",
          });
          if (!repair.ok) {
            console.error("[payphone:respuesta] cobro capturado, reserva sin confirmar:", repair.error);
          }
          return home(repair.ok ? "exito" : "pendiente", result.reservationId);
        }
        case "failed":
          return home("fallido", result.reservationId);
        default:
          console.error("[payphone:respuesta]", outcome);
          return home("pendiente", result.reservationId);
      }
    }
    case "already_approved": {
      // retorno recargado de un intento ya aprobado. El cobro está capturado:
      // verificar que la reserva realmente quedó confirmada (pudo fallar
      // confirmReservation justo después de capturar) y repararla si no.
      const { data } = await supabaseAdmin()
        .from("reservations")
        .select("status, payment_status")
        .eq("id", result.reservationId)
        .single();
      if (data?.status === "confirmed" && hasDeposit(data?.payment_status)) {
        return home("exito", result.reservationId);
      }
      const repair = await confirmReservation(result.reservationId, {
        paymentMethod: "payphone",
      });
      if (!repair.ok) {
        console.error("[payphone:respuesta] cobro capturado, reserva sin confirmar:", repair.error);
      }
      return home(repair.ok ? "exito" : "pendiente", result.reservationId);
    }
    case "stale":
      // no se confirmó el cobro (Payphone lo reversa solo en ~5 min): la
      // reserva ya estaba pagada por otro medio (→ exito) o cancelada/expirada
      return home(result.reason === "paid" ? "exito" : "expirado", result.reservationId);
    case "rejected":
      // pago cancelado/rechazado → la reserva sigue pending y puede reintentar
      notifyOwnerEvent({
        titulo: `Pago con tarjeta FALLIDO — ${SITE.bookingCodePrefix}-${result.reservationId.slice(0, 8).toUpperCase()}`,
        emoji: "⚠️",
        tipo: "cancelacion",
        lineas: ["El huésped canceló o el cobro fue rechazado.", "La reserva sigue pendiente y puede reintentar."],
      }).catch(() => {});
      return home("fallido", result.reservationId);
    case "error":
      // fallo de red/confirmación: NO marcar fallido — si nunca confirmamos,
      // Payphone reversa solo; la UI lo muestra como pendiente
      return home("pendiente", result.reservationId ?? undefined);
    default:
      // 'invalid' | 'unknown': parámetros incompletos o intento no registrado
      return home("pendiente");
  }
}
