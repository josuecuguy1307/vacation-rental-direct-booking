import type { SupabaseClient } from "@supabase/supabase-js";
import { TEMPLATES, WA_TEMPLATES, renderTemplate, type TemplateKey } from "./templates";
import { sendBrandedEmail } from "@/lib/notifications/email";
import { sendWhatsAppTemplate } from "@/lib/notifications/whatsapp";
import { notifyOwnerEvent } from "@/lib/owner-notify";
import { ensureBalanceLink, balanceTiming, code } from "@/lib/balance";
import { isFullyPaid } from "@/lib/payments/status";
import { makeReviewToken } from "@/lib/reviews";
import { snackLinkFor } from "@/lib/snack-token";
import { CB, MAPS_URL } from "@/lib/site-data";
import { getDuena, getEffectiveTemplates, getEffectiveTimeline, type TimelineCfg } from "@/lib/panel";
import { siteBaseUrl } from "@/lib/env";
import { SITE } from "@/config/site.config";

/* ============================================================
   Envío de mensajes programados (cron de 15 min + envío
   inmediato post-confirmación). Etapa 17/19:
   - WhatsApp por PLANTILLA aprobada (Meta) — si falla (plantilla
     sin aprobar, token vencido) marca failed_wa SIN romper el
     email ni el flujo, y reintenta en el siguiente cron.
   - Espejo a la dueña de cada mensaje enviado al huésped.
   - dueno_checkin / dueno_checkout: recordatorios del día para
     la dueña (quién llega / quién sale).
   - recordatorio_saldo: se cancela solo si ya no hay saldo.
   ============================================================ */

const MAX_ATTEMPTS = 3;
const fmtMoney = (n: number) => `$${n.toFixed(2)}`;

const LABELS: Record<string, string> = {
  confirmacion: "Confirmación",
  antes_llegada: "Antes de la llegada",
  despues_primera_noche: "Después de la primera noche",
  antes_salida: "Antes de la salida",
  despues_salida: "Después de la salida",
  recordatorio_saldo: "Recordatorio de saldo",
};

type PropertyInfo = {
  name: string;
  check_in_time: string | null;
  check_out_time: string | null;
  wifi_name: string | null;
  wifi_password: string | null;
};

type ReservationInfo = {
  id: string;
  status: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  check_in: string;
  check_out: string;
  num_guests: number;
  total: number;
  deposit_amount: number;
  balance_due_cents: number | null;
  payment_status: string;
  receipt_path: string | null;
  properties: PropertyInfo | PropertyInfo[] | null;
};

const RESERVATION_SELECT =
  "id, status, guest_name, guest_email, guest_phone, check_in, check_out, num_guests, total, deposit_amount, balance_due_cents, payment_status, receipt_path, properties(name, check_in_time, check_out_time, wifi_name, wifi_password)";

const fmtFecha = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString(SITE.locale, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "UTC",
  });

/** "15:00:00" → "15h00" */
const fmtHora = (t: string | null, fallback: string) =>
  t ? t.slice(0, 5).replace(":", "h") : fallback;

/** /resena/<token> por reserva; fallback al link externo del panel / env. */
/** Link personal de snacks; si falta el secreto, cae a la página sin token. */
function safeSnackLink(reservationId: string): string {
  try {
    return snackLinkFor(reservationId);
  } catch {
    return `${siteBaseUrl()}/snacks`;
  }
}

function reviewLinkFor(reservationId: string, fallback?: string): string {
  const base = siteBaseUrl();
  try {
    return `${base}/resena/${makeReviewToken(reservationId)}`;
  } catch {
    return fallback || process.env.REVIEW_LINK || `https://wa.me/${CB.whatsapp}`;
  }
}

/** Variables disponibles para los placeholders de templates.ts */
export function buildVars(
  r: ReservationInfo,
  opts: { reviewFallback?: string } = {}
): Record<string, string> {
  const p = (Array.isArray(r.properties) ? r.properties[0] : r.properties) ?? null;
  const totalC = Math.round(Number(r.total) * 100);
  const saldoC = isFullyPaid(r.payment_status) ? 0 : (r.balance_due_cents ?? 0);
  const pagadoC = totalC - saldoC;
  return {
    nombre: r.guest_name.split(" ")[0] || r.guest_name,
    codigo: code(r.id),
    fecha_checkin: fmtFecha(r.check_in),
    fecha_checkout: fmtFecha(r.check_out),
    hora_checkin: fmtHora(p?.check_in_time ?? null, "15h00"),
    hora_checkout: fmtHora(p?.check_out_time ?? null, "11h00"),
    huespedes: String(r.num_guests),
    maps_link: MAPS_URL,
    wifi_nombre: p?.wifi_name ?? process.env.WIFI_NAME ?? `${SITE.name}`,
    wifi_clave: p?.wifi_password ?? process.env.WIFI_PASSWORD ?? "(te la damos al llegar)",
    review_link: reviewLinkFor(r.id, opts.reviewFallback),
    link_snacks: safeSnackLink(r.id),
    whatsapp_anfitrion: CB.whatsappShow,
    total: fmtMoney(totalC / 100),
    pagado: fmtMoney(pagadoC / 100),
    saldo: fmtMoney(saldoC / 100),
    saldo_frase:
      saldoC > 0
        ? `El saldo pendiente de ${fmtMoney(saldoC / 100)} se cancela antes de tu salida.`
        : "Tu estadía está pagada por completo ✓",
    saldo_info: "",  // se completa async (link de pago) cuando aplica
    link_saldo: "",
  };
}

/** Completa saldo_info/link_saldo (genera el link de Payphone si toca). */
async function fillBalanceVars(
  db: SupabaseClient,
  r: ReservationInfo,
  templateKey: string,
  vars: Record<string, string>
): Promise<void> {
  const saldoC = isFullyPaid(r.payment_status) ? 0 : (r.balance_due_cents ?? 0);
  if (saldoC <= 0) return;
  if (templateKey !== "antes_llegada" && templateKey !== "recordatorio_saldo") return;
  if (balanceTiming() === "manual" && templateKey === "antes_llegada") return;

  try {
    const link = await ensureBalanceLink(db, r);
    if (!link) return;
    vars.link_saldo = link.link;
    vars.saldo_info =
      `SALDO PENDIENTE\nTu saldo pendiente es ${vars.saldo} — págalo aquí: ${link.link} o en efectivo al llegar.\n`;
  } catch (e) {
    console.error("[messaging] link de saldo:", (e as Error).message);
  }
}

/** Adjunto del recibo (solo para el email de confirmación). */
async function receiptAttachment(
  db: SupabaseClient,
  path: string | null
): Promise<{ filename: string; content: Buffer }[] | undefined> {
  if (!path) return undefined;
  const { data, error } = await db.storage.from("receipts").download(path);
  if (error || !data) {
    console.warn("[messaging] recibo no descargable:", error?.message);
    return undefined;
  }
  return [{ filename: `Recibo-${SITE.slug}.pdf`, content: Buffer.from(await data.arrayBuffer()) }];
}

/** Recordatorios del día para la DUEÑA (quién llega / quién sale). */
async function sendOwnerDayReminder(templateKey: string, r: ReservationInfo): Promise<void> {
  const llega = templateKey === "dueno_checkin";
  await notifyOwnerEvent({
    titulo: llega ? `Hoy llega ${r.guest_name}` : `Hoy sale ${r.guest_name}`,
    emoji: llega ? "🛬" : "🧳",
    lineas: [
      `${code(r.id)} · ${r.num_guests} huésped(es)`,
      llega
        ? `Check-in hoy (${r.check_in}) · estadía hasta ${r.check_out}`
        : `Check-out hoy (${r.check_out}) a las 11h00`,
      `Contacto: ${r.guest_email}${r.guest_phone ? ` · ${r.guest_phone}` : ""}`,
      ...(llega && !isFullyPaid(r.payment_status) && (r.balance_due_cents ?? 0) > 0
        ? [`💵 Saldo pendiente: ${fmtMoney((r.balance_due_cents ?? 0) / 100)}`]
        : []),
    ],
  });
}

/**
 * Procesa mensajes con send_at vencido (status pending, < 3 intentos).
 * `reservationId` acota a una reserva (envío inmediato post-confirmación).
 */
export async function processDueMessages(
  db: SupabaseClient,
  opts: { reservationId?: string; limit?: number } = {}
): Promise<{ processed: number; sent: number; failed: number }> {
  let query = db
    .from("scheduled_messages")
    .select(`*, reservations(${RESERVATION_SELECT})`)
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .lte("send_at", new Date().toISOString())
    .order("send_at")
    .limit(opts.limit ?? 50);
  if (opts.reservationId) query = query.eq("reservation_id", opts.reservationId);

  const { data: due, error } = await query;
  if (error) {
    console.error("[messaging] no se pudieron leer mensajes:", error.message);
    return { processed: 0, sent: 0, failed: 0 };
  }

  // settings del panel (plantillas editadas, toggles del timeline, link de
  // reseñas); si la lectura falla se usan los defaults del código
  let effTemplates = TEMPLATES;
  let effTimeline: TimelineCfg | null = null;
  let reviewFallback = "";
  if ((due ?? []).length) {
    try {
      const [t, tl, duena] = await Promise.all([
        getEffectiveTemplates(db), getEffectiveTimeline(db), getDuena(db),
      ]);
      effTemplates = t;
      effTimeline = tl;
      reviewFallback = duena.review_link;
    } catch (e) {
      console.warn("[messaging] settings no disponibles, uso defaults:", (e as Error).message);
    }
  }

  let sent = 0;
  let failed = 0;

  for (const msg of due ?? []) {
    const r = msg.reservations as ReservationInfo | null;
    const key = msg.template_key as string;

    if (!r || r.status !== "confirmed") {
      await db.from("scheduled_messages")
        .update({ status: "cancelled", last_error: "reserva no confirmada" })
        .eq("id", msg.id);
      continue;
    }

    // mensaje apagado desde el panel (módulo E) → se cancela, no se envía
    if (effTimeline && effTimeline[key] && !effTimeline[key].enabled) {
      await db.from("scheduled_messages")
        .update({ status: "cancelled", last_error: "desactivado en el panel" })
        .eq("id", msg.id);
      continue;
    }

    // ── recordatorios del día para la dueña ──
    if (key === "dueno_checkin" || key === "dueno_checkout") {
      try {
        await sendOwnerDayReminder(key, r);
        await db.from("scheduled_messages")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", msg.id);
        sent++;
      } catch (e) {
        const attempts = (msg.attempts ?? 0) + 1;
        await db.from("scheduled_messages")
          .update({ attempts, last_error: (e as Error).message.slice(0, 500),
            status: attempts >= MAX_ATTEMPTS ? "failed" : "pending" })
          .eq("id", msg.id);
      }
      continue;
    }

    const tpl = effTemplates[key as TemplateKey];
    if (!tpl) {
      await db.from("scheduled_messages")
        .update({ status: "cancelled", last_error: "template desconocido" })
        .eq("id", msg.id);
      continue;
    }

    // recordatorio de saldo: si ya no hay saldo (o el cobro es manual), muere solo
    if (key === "recordatorio_saldo") {
      const saldo = isFullyPaid(r.payment_status) ? 0 : (r.balance_due_cents ?? 0);
      if (saldo <= 0 || balanceTiming() === "manual") {
        await db.from("scheduled_messages")
          .update({ status: "cancelled", last_error: "sin saldo pendiente" })
          .eq("id", msg.id);
        continue;
      }
    }

    const vars = buildVars(r, { reviewFallback });
    await fillBalanceVars(db, r, key, vars);

    try {
      if (msg.channel === "email") {
        const attachments =
          key === "confirmacion" ? await receiptAttachment(db, r.receipt_path) : undefined;
        await sendBrandedEmail({
          to: r.guest_email,
          subject: renderTemplate(tpl.asunto, vars),
          text: renderTemplate(tpl.email, vars),
          metaLine: `Reserva ${vars.codigo} · ${r.check_in} → ${r.check_out}`,
          attachments,
        });
      } else {
        if (!r.guest_phone) throw new Error("reserva sin teléfono");
        const wa = WA_TEMPLATES[key as TemplateKey];
        if (!wa) throw new Error(`sin plantilla WA mapeada para ${key}`);
        await sendWhatsAppTemplate(r.guest_phone, wa.name, wa.params.map((k) => vars[k] ?? ""));
      }

      await db.from("scheduled_messages")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", msg.id);
      sent++;

      // espejo corto a la dueña (su respaldo de lo que pasa)
      notifyOwnerEvent({
        titulo: `Mensaje enviado a ${r.guest_name.split(" ")[0]}`,
        emoji: "✅",
        lineas: [
          `"${LABELS[key] ?? key}" por ${msg.channel === "email" ? "email" : "WhatsApp"}`,
          `${code(r.id)} · estadía ${r.check_in} → ${r.check_out}`,
        ],
        esEspejo: true,
        tipo: "mensajes_auto",
      }).catch(() => {});
    } catch (e) {
      const attempts = (msg.attempts ?? 0) + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      // WhatsApp: marca failed_wa SIN romper el email ni el flujo (C4)
      const finalStatus = exhausted
        ? (msg.channel === "whatsapp" ? "failed_wa" : "failed")
        : "pending";
      console.error(
        `[messaging] fallo ${key}/${msg.channel} (intento ${attempts}/${MAX_ATTEMPTS}):`,
        (e as Error).message
      );
      await db.from("scheduled_messages")
        .update({ attempts, last_error: (e as Error).message.slice(0, 500), status: finalStatus })
        .eq("id", msg.id);
      if (exhausted) failed++;
    }
  }

  return { processed: (due ?? []).length, sent, failed };
}
