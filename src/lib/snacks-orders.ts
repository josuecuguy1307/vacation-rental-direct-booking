import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { confirmPayphoneTransaction, type PayphoneConfirmResult } from "@/lib/payments/payphone";
import { sendBrandedEmail } from "@/lib/notifications/email";
import { notifyOwnerEvent } from "@/lib/owner-notify";
import { SITE } from "@/config/site.config";

/* ============================================================
   Órdenes de snacks (Etapa 16) — mini-checkout de /snacks.
   El cliente solo manda {addon_id, cantidad}: los precios y el
   total se calculan SIEMPRE en servidor con la tabla addons.
   Sin formulario: email/teléfono del comprador los entrega
   Payphone en la confirmación del pago.
   ============================================================ */

export const snackOrderSchema = z.object({
  items: z
    .array(z.object({
      addon_id: z.string().uuid("Snack inválido"),
      cantidad: z.number().int().min(1).max(20, "Máximo 20 por snack"),
    }))
    .min(1, "Tu cajita está vacía")
    .max(30),
});

export type SnackOrderInput = z.infer<typeof snackOrderSchema>;

export type SnackItem = {
  addon_id: string;
  nombre: string;
  precio_unit_cents: number;
  cantidad: number;
};

/** Filas reales de la DB que puede comprar el huésped. */
export type SnackRow = { id: string; name: string; price: number; active?: boolean };

/**
 * Construye los items con precios del SERVIDOR (función pura, testeable):
 * cualquier precio que mande el cliente se ignora; addon desconocido o
 * inactivo → error.
 */
export function computeSnackOrder(
  selections: SnackOrderInput["items"],
  rows: SnackRow[]
): { items: SnackItem[]; total_cents: number } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = selections.map((sel) => {
    const row = byId.get(sel.addon_id);
    if (!row) throw new Error("Uno de los snacks ya no está disponible");
    return {
      addon_id: row.id,
      nombre: row.name,
      precio_unit_cents: Math.round(Number(row.price) * 100),
      cantidad: sel.cantidad,
    };
  });
  const total_cents = items.reduce((s, i) => s + i.precio_unit_cents * i.cantidad, 0);
  if (total_cents <= 0) throw new Error("Tu cajita está vacía");
  return { items, total_cents };
}

/**
 * Marca la orden como pagada SOLO si seguía pending (transición atómica):
 * devuelve true únicamente la primera vez — una doble confirmación no
 * vuelve a disparar el recibo ni el WhatsApp.
 */
export async function markOrderPaid(
  db: SupabaseClient,
  orderId: string,
  data: { paymentId?: string | null; email?: string | null; phone?: string | null }
): Promise<boolean> {
  const { data: updated, error } = await db
    .from("snack_orders")
    .update({
      status: "paid",
      ...(data.paymentId ? { payment_id: data.paymentId } : {}),
      ...(data.email ? { customer_email: data.email } : {}),
      ...(data.phone ? { customer_phone: data.phone } : {}),
    })
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id");
  if (error) {
    console.error("[snacks] markOrderPaid:", error.message);
    return false;
  }
  return (updated ?? []).length > 0;
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Recibo HTML itemizado (va dentro del wrapper con logo/branding). */
export function snackReceiptHtml(order: {
  id: string;
  items: SnackItem[];
  total_cents: number;
}, paidAt: Date): string {
  const filas = order.items.map((i) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #efe9dd">${i.nombre}</td>
      <td style="padding:8px 0;border-bottom:1px solid #efe9dd;text-align:center">${i.cantidad}</td>
      <td style="padding:8px 0;border-bottom:1px solid #efe9dd;text-align:right">${money(i.precio_unit_cents)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #efe9dd;text-align:right">${money(i.precio_unit_cents * i.cantidad)}</td>
    </tr>`).join("");

  const fecha = paidAt.toLocaleDateString(SITE.locale, {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: SITE.timezone,
  });

  return `
    <p style="margin:0 0 16px;line-height:1.6">¡Gracias por tu compra! Aquí está el detalle de tus snacks:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px">
      <tr>
        <th style="text-align:left;padding:6px 8px 6px 0;border-bottom:2px solid #E3DAC6;font-size:11px;letter-spacing:.08em;color:#8a7f6b">SNACK</th>
        <th style="text-align:center;padding:6px 8px;border-bottom:2px solid #E3DAC6;font-size:11px;letter-spacing:.08em;color:#8a7f6b">CANT.</th>
        <th style="text-align:right;padding:6px 0 6px 8px;border-bottom:2px solid #E3DAC6;font-size:11px;letter-spacing:.08em;color:#8a7f6b">PRECIO</th>
        <th style="text-align:right;padding:6px 0 6px 8px;border-bottom:2px solid #E3DAC6;font-size:11px;letter-spacing:.08em;color:#8a7f6b">SUBTOTAL</th>
      </tr>
      ${filas}
      <tr>
        <td colspan="3" style="padding:12px 0;font-weight:bold">TOTAL PAGADO</td>
        <td style="padding:12px 0;text-align:right;font-weight:bold;font-size:16px">${money(order.total_cents)}</td>
      </tr>
    </table>
    <p style="margin:0 0 6px;font-size:13px;color:#8a7f6b">Método: Tarjeta / saldo Payphone</p>
    <p style="margin:0 0 6px;font-size:13px;color:#8a7f6b">Fecha: ${fecha}</p>
    <p style="margin:0;font-size:13px;color:#8a7f6b">Orden: ${order.id.slice(0, 8).toUpperCase()}</p>`;
}

export type SnackReturnResolution =
  | { kind: "approved" }            // recién pagada (recibo + aviso ya disparados)
  | { kind: "already_paid" }        // recarga del retorno / segundo intento
  | { kind: "rejected" }
  | { kind: "cancelled" }           // la orden ya no existe/aplica
  | { kind: "error" };

/**
 * Resuelve el retorno de la cajita para órdenes de snacks (ctid "SN…").
 * Mismas garantías que las reservas: no se CONFIRMA (captura) un cobro si
 * la orden ya está pagada — Payphone lo reversa solo en ~5 min — y una
 * doble confirmación no duplica el recibo (transición atómica de status).
 */
export async function resolveSnackReturn(
  db: SupabaseClient,
  params: { id: string | null; clientTransactionId: string | null }
): Promise<SnackReturnResolution> {
  const txId = Number(params.id);
  const clientTxId = params.clientTransactionId ?? "";
  if (!Number.isInteger(txId) || txId <= 0 || !clientTxId || clientTxId.length > 15) {
    return { kind: "error" };
  }

  const { data: payment } = await db
    .from("payments")
    .select("id, snack_order_id, amount_cents, status")
    .eq("provider", "payphone")
    .eq("client_transaction_id", clientTxId)
    .single();
  if (!payment?.snack_order_id) return { kind: "error" };

  if (payment.status === "approved") return { kind: "already_paid" };

  const { data: order } = await db
    .from("snack_orders")
    .select("id, items, total_cents, status")
    .eq("id", payment.snack_order_id)
    .single();
  if (!order) return { kind: "error" };
  if (order.status === "paid") {
    // pagada por otro intento: NO confirmar este cobro → Payphone lo reversa
    await db.from("payments").update({
      status: "rejected",
      raw_response: { skipped_confirm: true, reason: "orden ya pagada", payphone_tx_id: txId },
    }).eq("id", payment.id);
    return { kind: "already_paid" };
  }
  if (order.status === "cancelled") {
    await db.from("payments").update({
      status: "rejected",
      raw_response: { skipped_confirm: true, reason: "orden cancelada", payphone_tx_id: txId },
    }).eq("id", payment.id);
    return { kind: "cancelled" };
  }

  let confirm: PayphoneConfirmResult;
  try {
    confirm = await confirmPayphoneTransaction(txId, clientTxId);
  } catch (e) {
    console.error("[snacks] confirm falló:", (e as Error).message);
    return { kind: "error" };
  }

  if (!confirm.approved) {
    await db.from("payments").update({
      status: confirm.httpOk ? "rejected" : "error",
      transaction_id: confirm.transactionId,
      raw_response: confirm.raw,
    }).eq("id", payment.id);
    return confirm.httpOk ? { kind: "rejected" } : { kind: "error" };
  }

  // defensa de monto exacto (como en reservas)
  if (confirm.amount !== null && confirm.amount !== payment.amount_cents) {
    console.error(`[snacks] monto no coincide: esperado ${payment.amount_cents}, Payphone ${confirm.amount}`);
    await db.from("payments").update({
      status: "error", transaction_id: confirm.transactionId, raw_response: confirm.raw,
    }).eq("id", payment.id);
    return { kind: "error" };
  }

  await db.from("payments").update({
    status: "approved",
    transaction_id: confirm.transactionId,
    raw_response: confirm.raw,
    confirmed_at: new Date().toISOString(),
  }).eq("id", payment.id);

  // transición atómica: solo el PRIMER retorno dispara recibo + aviso
  const transitioned = await markOrderPaid(db, order.id, {
    paymentId: payment.id,
    email: confirm.email,
    phone: confirm.phoneNumber,
  });
  if (transitioned) {
    const items = order.items as SnackItem[];
    const resumen = items.map((i) => `${i.nombre} ×${i.cantidad}`).join(", ");
    const quien = confirm.email ?? confirm.phoneNumber ?? "huésped";

    if (confirm.email) {
      sendBrandedEmail({
        to: confirm.email,
        subject: `¡Gracias por tu compra! 🍫 Recibo de snacks · ${SITE.name}`,
        html: snackReceiptHtml({ id: order.id, items, total_cents: order.total_cents }, new Date()),
        text: "",
      }).catch((e) => console.error("[snacks] recibo email:", e));
    }
    notifyOwnerEvent({
      titulo: "Pedido de snacks pagado",
      emoji: "🍫",
      lineas: [resumen, `Total: ${money(order.total_cents)} — ${quien}`],
    }).catch(() => {});
  }

  return { kind: "approved" };
}
