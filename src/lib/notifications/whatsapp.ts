import { SITE } from "@/config/site.config";
import { optionalEnv } from "@/lib/env";
/* ============================================================
   WhatsApp al dueño — Meta WhatsApp Cloud API.
   Avisa al anfitrión (OWNER_WHATSAPP) cuando ENTRA una reserva
   nueva y cuando se CONFIRMA el pago. Sin WHATSAPP_TOKEN solo
   loguea y sigue (nunca bloquea el flujo de reserva).
   ============================================================ */

export type ReservationNotifyData = {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_phone?: string | null;
  check_in: string;
  check_out: string;
  num_guests: number;
  total: number;
  deposit_amount: number;
  status: string;                       // 'pending' | 'confirmed'
  payment_method?: string | null;       // 'bank_transfer' | 'payphone' | 'pichincha'
  arrival_time?: string | null;         // franja estimada de llegada
  pet_count?: number | null;
  guest_message?: string | null;        // mensaje del huésped al anfitrión
  companions?: string[] | null;         // nombres de los demás huéspedes
  snacks?: Array<{ name: string; quantity: number }>;
};

const PAY_METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Transferencia bancaria",
  payphone: "Tarjeta (Payphone)",
  pichincha: "Banco Pichincha",
};

const GRAPH_URL = "https://graph.facebook.com/v21.0";

function buildMessage(r: ReservationNotifyData): string {
  const code = r.id.slice(0, 8).toUpperCase();
  const estado = r.status === "confirmed"
    ? "✅ CONFIRMADA (pago recibido)"
    : "🕐 PENDIENTE (esperando pago)";
  const lines = [
    `🌿 *${SITE.name} — ${r.status === "confirmed" ? "reserva confirmada" : "nueva reserva"}*`,
    ``,
    `Código: *${code}*`,
    `Estado: ${estado}`,
    `Huésped: ${r.guest_name}`,
    `Contacto: ${r.guest_email}${r.guest_phone ? ` · ${r.guest_phone}` : ""}`,
    `Fechas: ${r.check_in} → ${r.check_out}`,
    `Huéspedes: ${r.num_guests}`,
  ];
  if (r.arrival_time) lines.push(`Llegada estimada: ${r.arrival_time}`);
  if (r.pet_count && r.pet_count > 0) lines.push(`Mascotas: ${r.pet_count} 🐾`);
  if (r.companions?.length) lines.push(`Acompañantes: ${r.companions.join(", ")}`);
  if (r.guest_message) lines.push(`Mensaje: "${r.guest_message}"`);
  if (r.snacks?.length) {
    lines.push(`Cajita: ${r.snacks.map((s) => `${s.name} ×${s.quantity}`).join(", ")}`);
  }
  lines.push(
    r.deposit_amount < r.total
      ? `Total: $${r.total.toFixed(2)} · Anticipo: $${r.deposit_amount.toFixed(2)}`
      : `Total: $${r.total.toFixed(2)} · Pago completo`
  );
  if (r.payment_method) {
    lines.push(`Pago: ${PAY_METHOD_LABEL[r.payment_method] ?? r.payment_method}`);
  }
  return lines.join("\n");
}

/**
 * Normaliza un teléfono al formato de la Cloud API (solo dígitos con código
 * de país). Un número local que empieza en 0 se completa con
 * SITE.phoneCountryCode (ej. "0991234567" → "52991234567").
 */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = SITE.phoneCountryCode + digits.slice(1);
  return digits;
}

/**
 * Envío por PLANTILLA aprobada (Meta exige plantillas para mensajes que
 * inicia el negocio fuera de la ventana de 24 h). LANZA si falla: el
 * scheduler usa el error para reintentar y marcar failed_wa.
 * `params` se mapean en orden a {{1}}, {{2}}, … del body de la plantilla.
 */
export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  params: string[],
  lang = "es"
): Promise<void> {
  const token = optionalEnv("WHATSAPP_TOKEN");
  const phoneNumberId = optionalEnv("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp Cloud API is not configured: set WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID (see .env.example)");
  }

  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(phone),
      type: "template",
      template: {
        name: templateName,
        language: { code: lang },
        ...(params.length
          ? {
              components: [{
                type: "body",
                parameters: params.map((text) => ({ type: "text", text })),
              }],
            }
          : {}),
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    // errores típicos: plantilla no aprobada (132001), token expirado (190),
    // destinatario fuera de la lista de prueba (131030)
    throw new Error(`WhatsApp template "${templateName}" HTTP ${res.status}: ${body}`);
  }
}

/**
 * WhatsApp de TEXTO LIBRE al huésped — solo funciona dentro de la ventana
 * de 24 h de Meta (si el huésped escribió antes). El timeline usa
 * sendWhatsAppTemplate; esto queda para respuestas en sesión.
 */
export async function sendGuestWhatsApp(phone: string, body: string): Promise<void> {
  const token = optionalEnv("WHATSAPP_TOKEN");
  const phoneNumberId = optionalEnv("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp Cloud API is not configured: set WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID (see .env.example)");
  }

  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(phone),
      type: "text",
      text: { body },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`WhatsApp HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/** Texto libre al DUEÑO. Fire-and-forget: loguea errores, no lanza.
 *  `toOverride` permite usar el número editado en el panel (módulo F). */
export async function notifyOwnerText(body: string, toOverride?: string): Promise<void> {
  const token = optionalEnv("WHATSAPP_TOKEN");
  const phoneNumberId = optionalEnv("WHATSAPP_PHONE_NUMBER_ID");
  const to = toOverride || optionalEnv("OWNER_WHATSAPP");

  if (!token || !phoneNumberId) {
    console.log(`[whatsapp] sin credenciales — mensaje omitido:\n${body}`);
    return;
  }
  if (!to) {
    console.log("[whatsapp] no host number (OWNER_WHATSAPP or panel → Settings): notice skipped");
    return;
  }

  try {
    const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[whatsapp] HTTP ${res.status}:`, await res.text());
    }
  } catch (e) {
    console.error("[whatsapp] fallo al enviar:", e);
  }
}

/** Notifica al dueño una reserva (nueva o confirmada). No lanza. */
export async function notifyOwnerWhatsApp(r: ReservationNotifyData): Promise<void> {
  await notifyOwnerText(buildMessage(r));
}

