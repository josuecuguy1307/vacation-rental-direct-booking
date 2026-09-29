import { SITE } from "@/config/site.config";
/* ============================================================
   Plantillas de mensajes al HUÉSPED (es) — Etapa 11.
   EDITABLE por el cliente: cambia los textos aquí sin tocar el
   resto del sistema. Tono cercano y claro, estilo Airbnb.

   Placeholders disponibles (se reemplazan al enviar):
     {nombre}            nombre del huésped
     {codigo}            código corto de la reserva (8 chars)
     {fecha_checkin}     "viernes, 10 de julio de 2026"
     {fecha_checkout}    ídem para la salida
     {hora_checkin}      "15h00"
     {hora_checkout}     "11h00"
     {huespedes}         número de huéspedes
     {maps_link}         link de Google Maps de la casa
     {wifi_nombre}       nombre de la red wifi
     {wifi_clave}        contraseña del wifi
     {review_link}       link para dejar reseña (REVIEW_LINK)
     {link_snacks}       link PERSONAL a la carta de snacks (firmado por reserva)
     {whatsapp_anfitrion} número del anfitrión para dudas
   ============================================================ */

export type TemplateKey =
  | "confirmacion"
  | "antes_llegada"
  | "despues_primera_noche"
  | "antes_salida"
  | "despues_salida"
  | "recordatorio_saldo";

export type MessageTemplate = {
  asunto: string;    // subject del email
  email: string;     // cuerpo email (texto plano; el wrapper le pone branding)
  whatsapp: string;  // cuerpo WhatsApp (texto con *negritas* de WhatsApp)
};

export const TEMPLATES: Record<TemplateKey, MessageTemplate> = {
  confirmacion: {
    asunto: `Reserva confirmada {codigo} · ${SITE.name} — te esperamos el {fecha_checkin}`,
    email: `Hola {nombre},

¡Gracias por reservar ${SITE.name}! Tu reserva está confirmada y ya estamos preparando todo para recibirte.

Tu estadía: del {fecha_checkin} al {fecha_checkout} para {huespedes} huésped(es).
Código de reserva: {codigo}
Total pagado: {total}

Adjunto encontrarás tu recibo de confirmación con el detalle de tu reserva y del pago.

Un día antes de tu llegada te enviaré los detalles del check-in: cómo llegar, el wifi y todo lo que necesitas para entrar sin complicaciones.

Si tienes cualquier pregunta antes de tu viaje, solo responde a este correo o escríbeme al WhatsApp {whatsapp_anfitrion}.

¡Nos vemos pronto!
${SITE.name} · ${SITE.location}`,
    whatsapp: `🌿 Hola {nombre}, ¡gracias por reservar *${SITE.name}*!

Tu reserva está *confirmada* ✓
📅 Del {fecha_checkin} al {fecha_checkout} · {huespedes} huésped(es)
Código: *{codigo}*

Un día antes de tu llegada te enviaré los detalles del check-in (cómo llegar, wifi y acceso).

Cualquier duda, escríbeme por aquí. ¡Nos vemos pronto!`,
  },

  antes_llegada: {
    asunto: "Mañana te esperamos · {codigo} · detalles de tu llegada",
    email: `Hola {nombre},

¡Mañana es el día! Aquí tienes todo lo que necesitas para tu llegada a ${SITE.name}.

CHECK-IN
A partir de las {hora_checkin}. Si llegas más tarde no hay problema — avísame por WhatsApp para coordinar.

CÓMO LLEGAR
{maps_link}
Dirección: ${SITE.address}. Al llegar, escríbeme y te recibimos.

WIFI
Red: {wifi_nombre}
Contraseña: {wifi_clave}

{saldo_info}

SNACKS
Durante tu estadía puedes pedir snacks y antojos desde tu carta personal — se suman a tu cuenta y se pagan al final: {link_snacks}

RECOMENDACIONES
- Trae todo lo que necesites para disfrutar de la casa y sus áreas exteriores.
- Si necesitas indicaciones en el camino, escríbeme al {whatsapp_anfitrion}.

¡Buen viaje! Te esperamos.
${SITE.name} · ${SITE.location}`,
    whatsapp: `🌿 Hola {nombre}, ¡mañana te esperamos en *${SITE.name}*!

🕒 *Check-in:* desde las {hora_checkin}
📍 *Cómo llegar:* {maps_link}
📶 *Wifi:* {wifi_nombre} · clave: {wifi_clave}
🍫 *Snacks (tu carta personal):* {link_snacks}

{saldo_info}Al llegar al portón escríbeme por aquí y te recibimos. Si llegas más tarde de lo previsto, no pasa nada — solo avísame.

¡Buen viaje! 🚗`,
  },

  despues_primera_noche: {
    asunto: `¿Qué tal tu primera noche? · {codigo} · ${SITE.name}`,
    email: `Hola {nombre},

Espero que la llegada haya sido fácil y que tu primera noche en ${SITE.name} haya sido muy agradable.

Quería contarte que estoy aquí para lo que necesites durante tu estadía: una recomendación de a dónde ir, algo de la casa, lo que sea. Escríbeme al {whatsapp_anfitrion} y lo resolvemos enseguida.

¡Que disfrutes tu estadía!
${SITE.name}`,
    whatsapp: `🌿 Hola {nombre}, ¿qué tal la primera noche en *${SITE.name}*?

Espero que la entrada haya sido fácil y que estén disfrutando la casa. Estoy aquí para lo que necesites: recomendaciones, algo de la casa, lo que sea — solo escríbeme por aquí. 😊`,
  },

  antes_salida: {
    asunto: `Mañana es tu check-out · {codigo} · ${SITE.name}`,
    email: `Hola {nombre},

¡Cómo pasa el tiempo! Mañana {fecha_checkout} es tu salida de ${SITE.name}.

CHECK-OUT
Hasta las {hora_checkout}. Si necesitas un poco más de tiempo, escríbeme y vemos si es posible según la disponibilidad.

ANTES DE SALIR
- Deja las llaves donde te indicamos al llegar.
- Apaga luces y aire acondicionado.
- Cierra bien puertas y ventanas.

Gracias por elegirnos. ¡Que disfrutes tu último día!
${SITE.name} · ${SITE.location}`,
    whatsapp: `🌿 Hola {nombre}, mañana {fecha_checkout} es tu *check-out* de ${SITE.name} (hasta las {hora_checkout}).

Antes de salir: deja las llaves donde te indicamos, apaga luces y A/C, y cierra bien puertas y ventanas.

¿Necesitas salir un poco más tarde? Escríbeme y vemos si es posible. 🙂`,
  },

  despues_salida: {
    asunto: "Gracias por quedarte con nosotros 🌿 · {codigo}",
    email: `Hola {nombre},

¡Gracias por quedarte con nosotros! Esperamos que tu estadía en ${SITE.name} haya sido tan especial como esperabas y que se lleven lindos recuerdos de ${SITE.cityLabel}.

Si tienes un minuto, nos ayudaría muchísimo que dejes una reseña de tu experiencia:
{review_link}

Tu opinión ayuda a otras familias a descubrir este lugar — y a nosotros a seguir mejorando.

¡Esperamos verte de nuevo!
${SITE.name} · ${SITE.location}`,
    whatsapp: `🌿 Hola {nombre}, ¡gracias por quedarte en *${SITE.name}*!

Esperamos que se lleven lindos recuerdos de ${SITE.cityLabel}. Si tienes un minuto, nos ayudaría muchísimo una reseña de tu experiencia:
{review_link}

¡Esperamos verte de nuevo! 💚`,
  },

  recordatorio_saldo: {
    asunto: "Hoy es el día 🌿 · {codigo} — tu saldo pendiente",
    email: `Hola {nombre},

¡Hoy te recibimos en ${SITE.name}! Un recordatorio rápido antes de tu llegada:

Tu saldo pendiente es {saldo}. Puedes pagarlo aquí:
{link_saldo}

O si prefieres, en efectivo al llegar — como te quede más cómodo.

¡Buen viaje! Nos vemos en un rato.
${SITE.name} · ${SITE.location}`,
    whatsapp: `🌿 ¡Hola {nombre}, hoy te esperamos en ${SITE.name}!

Recordatorio: tu saldo pendiente es *{saldo}*. Puedes pagarlo aquí:
{link_saldo}

O en efectivo al llegar, como prefieras. ¡Buen viaje! 🚗`,
  },
};

/* ── Plantillas de WhatsApp aprobadas en Meta (Etapa 17-C) ──────────
   Mapa CONFIGURABLE: mensaje del timeline → nombre de plantilla en el
   WhatsApp Manager + qué variable va en cada {{n}} (en orden).
   Los textos exactos para pegar están en docs/whatsapp-templates.md. */
export const WA_TEMPLATES: Record<TemplateKey, { name: string; params: string[] }> = {
  confirmacion:           { name: "confirmacion_reserva", params: ["nombre", "codigo", "fecha_checkin", "fecha_checkout", "huespedes", "total"] },
  antes_llegada:          { name: "antes_llegada",        params: ["nombre", "hora_checkin", "maps_link", "wifi_nombre", "wifi_clave"] },
  despues_primera_noche:  { name: "primera_noche",        params: ["nombre"] },
  antes_salida:           { name: "antes_salida",         params: ["nombre", "fecha_checkout", "hora_checkout"] },
  despues_salida:         { name: "despues_salida",       params: ["nombre", "review_link"] },
  recordatorio_saldo:     { name: "recordatorio_saldo",   params: ["nombre", "saldo", "link_saldo"] },
};

/** Reemplaza {placeholders}; deja visible (y logueable) cualquier faltante. */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{([a-z_]+)\}/g, (m, key: string) => vars[key] ?? m);
}

/** Placeholders sin resolver tras el render (para tests y logs). */
export function missingPlaceholders(rendered: string): string[] {
  return [...rendered.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
}
