import type { SupabaseClient } from "@supabase/supabase-js";
import { sendBrandedEmail } from "@/lib/notifications/email";
import { notifyOwnerText } from "@/lib/notifications/whatsapp";
import { code } from "@/lib/balance";
import { SITE } from "@/config/site.config";

/* ============================================================
   Garantía reembolsable (Lane 2).

   La garantía (properties.guarantee_cents, $30) se COBRA con la
   reserva —parte del anticipo, ver lib/pricing— y se DEVUELVE al
   finalizar la estadía. Este módulo deja listo el ciclo para que
   el panel de la dueña (Lane 3/4) lo dispare:

     1. setGuaranteeRefundMethod — guarda la preferencia del huésped
        (tarjeta | transferencia), capturada al finalizar la estadía.
     2. refundGuarantee — marca la garantía como reembolsada y envía
        el comprobante + mensaje automático al huésped, reusando el
        correo branded + aviso al dueño (igual que el pago de saldo,
        lib/balance.markBalancePaid). NO reinventa mensajería.

   Idempotente: solo opera sobre garantia_estado = 'pendiente'.
   No mueve dinero por sí mismo (Payphone no reembolsa por API en
   este flujo): la devolución la ejecuta la dueña; aquí se registra
   el estado, se audita y se avisa al huésped.
   ============================================================ */

export type GuaranteeMethod = "tarjeta" | "transferencia";

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

const METHOD_LABEL: Record<GuaranteeMethod, string> = {
  tarjeta: "a tu tarjeta",
  transferencia: "por transferencia bancaria",
};

/**
 * Preferencia de devolución del huésped (al finalizar la estadía).
 * Solo aplica si la garantía sigue pendiente.
 */
export async function setGuaranteeRefundMethod(
  db: SupabaseClient,
  reservationId: string,
  metodo: GuaranteeMethod
): Promise<{ ok: boolean; error?: string }> {
  if (metodo !== "tarjeta" && metodo !== "transferencia") {
    return { ok: false, error: "Método inválido (tarjeta o transferencia)" };
  }
  const { data, error } = await db
    .from("reservations")
    .update({ garantia_metodo: metodo })
    .eq("id", reservationId)
    .eq("garantia_estado", "pendiente")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!(data ?? []).length) {
    return { ok: false, error: "La garantía no está pendiente (ya reembolsada o sin garantía)" };
  }
  return { ok: true };
}

/**
 * Dispara el reembolso de la garantía (lo llama el panel de la dueña).
 * Transición atómica pendiente → reembolsada (una doble ejecución no
 * re-envía el comprobante), guarda método + auditoría, y envía comprobante
 * al huésped + aviso al dueño. Idempotente.
 */
export async function refundGuarantee(
  db: SupabaseClient,
  reservationId: string,
  opts: { metodo?: GuaranteeMethod; refundedBy?: string } = {}
): Promise<{ ok: boolean; already?: boolean; error?: string }> {
  const { data: r, error: fetchErr } = await db
    .from("reservations")
    .select(
      "id, guest_name, guest_email, garantia_amount_cents, garantia_estado, garantia_metodo"
    )
    .eq("id", reservationId)
    .single();

  if (fetchErr || !r) return { ok: false, error: "Reserva no encontrada" };
  if (!r.garantia_amount_cents || r.garantia_amount_cents <= 0) {
    return { ok: false, error: "Esta reserva no tiene garantía cobrada" };
  }
  if (r.garantia_estado === "reembolsada") return { ok: true, already: true };

  const metodo = (opts.metodo ?? r.garantia_metodo) as GuaranteeMethod | null;
  if (metodo !== "tarjeta" && metodo !== "transferencia") {
    return { ok: false, error: "Falta el método de devolución (tarjeta o transferencia)" };
  }

  // pendiente → reembolsada; el filtro sobre garantia_estado hace la
  // transición atómica (dos clicks del panel no duplican el comprobante)
  const { data: updated, error: updErr } = await db
    .from("reservations")
    .update({
      garantia_estado: "reembolsada",
      garantia_metodo: metodo,
      garantia_refunded_at: new Date().toISOString(),
      ...(opts.refundedBy ? { garantia_refunded_by: opts.refundedBy } : {}),
    })
    .eq("id", reservationId)
    .eq("garantia_estado", "pendiente")
    .select("id");
  if (updErr) return { ok: false, error: updErr.message };
  if (!(updated ?? []).length) return { ok: true, already: true };

  const cents = Number(r.garantia_amount_cents);
  const firstName = String(r.guest_name ?? "").split(" ")[0] || "hola";

  // comprobante + mensaje automático al huésped (correo branded existente)
  sendBrandedEmail({
    to: r.guest_email,
    subject: `Garantía devuelta · ${code(r.id)} · ${SITE.name}`,
    text: `Hola ${firstName},

¡Gracias por cuidar la casa como tuya! Te devolvimos tu garantía de ${fmt(cents)} ${METHOD_LABEL[metodo]}.

Según el medio puede tardar unos días en reflejarse. Cualquier duda escríbenos por WhatsApp. ¡Esperamos verte pronto! 🌿`,
  }).catch((e) => console.error("[garantia] email comprobante:", e));

  notifyOwnerText(
    `🔁 *${SITE.name} — garantía reembolsada*\n${code(r.id)} · ${r.guest_name}\n${fmt(cents)} devueltos ${METHOD_LABEL[metodo]}${opts.refundedBy ? `\nRegistró: ${opts.refundedBy}` : ""}`
  ).catch(() => {});

  return { ok: true };
}
