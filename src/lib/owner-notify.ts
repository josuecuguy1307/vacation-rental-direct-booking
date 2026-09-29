import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendBrandedEmail } from "@/lib/notifications/email";
import { notifyOwnerText } from "@/lib/notifications/whatsapp";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getDuena, DEFAULT_AVISOS, type AvisoTipo, type DuenaCfg } from "@/lib/panel";
import { SITE } from "@/config/site.config";

/* ============================================================
   Respaldo total para la DUEÑA (Etapa 19-C) + acciones firmadas
   (Etapa 19-B): cada evento del negocio le llega por email y
   WhatsApp (OWNER_EMAIL / OWNER_WHATSAPP), y el comprobante de
   transferencia trae botones "Confirmar / Rechazar" de un solo
   uso, sin login (token HMAC).

   Volumen: OWNER_DIGEST=instant (default) manda todo al momento;
   =daily agrupa los ESPEJOS de mensajes del timeline en un
   resumen diario por email (el WhatsApp espejo sigue al momento,
   es barato de leer).
   ============================================================ */

/* Contacto/digest de la dueña: editable en el panel (módulo F), con caché
   corto para no consultar la BD en cada aviso. Fallback a env si la BD falla. */
let duenaCache: { cfg: DuenaCfg; at: number } | null = null;
async function ownerCfg(): Promise<DuenaCfg> {
  if (duenaCache && Date.now() - duenaCache.at < 60_000) return duenaCache.cfg;
  try {
    const cfg = await getDuena(supabaseAdmin());
    duenaCache = { cfg, at: Date.now() };
    return cfg;
  } catch {
    return {
      email: process.env.OWNER_EMAIL ?? "",
      whatsapp: process.env.OWNER_WHATSAPP ?? "",
      digest: process.env.OWNER_DIGEST === "daily" ? "daily" : "instant",
      review_link: process.env.REVIEW_LINK ?? "",
      avisos: DEFAULT_AVISOS,
    };
  }
}

/** Email + WhatsApp a la dueña (fire-and-forget, jamás rompe el flujo). */
export async function notifyOwnerEvent(ev: {
  titulo: string;       // "Nueva reserva" / "Pago recibido" / …
  emoji?: string;
  lineas: string[];     // datos del evento, una por línea
  html?: string;        // opcional: cuerpo email enriquecido (links/botones)
  esEspejo?: boolean;   // espejo de mensaje del timeline (agrupable en digest)
  tipo?: AvisoTipo;     // tipo de aviso: si la dueña lo apagó, no se envía
}): Promise<void> {
  const duena = await ownerCfg();
  if (ev.tipo && duena.avisos[ev.tipo] === false) return; // apagado en Notificaciones
  const wa = `${ev.emoji ?? "🔔"} *${SITE.name} — ${ev.titulo}*\n${ev.lineas.join("\n")}`;
  const tasks: Promise<unknown>[] = [notifyOwnerText(wa, duena.whatsapp).catch(() => {})];

  const skipEmail = ev.esEspejo && duena.digest === "daily"; // va al resumen diario
  if (duena.email && !skipEmail) {
    tasks.push(
      sendBrandedEmail({
        to: duena.email,
        subject: `[${SITE.name}] ${ev.titulo}`,
        text: ev.lineas.join("\n"),
        ...(ev.html ? { html: ev.html } : {}),
      }).catch((e) => console.error("[owner-notify] email:", e))
    );
  }
  await Promise.allSettled(tasks);
}

/* ── Resumen diario de espejos (OWNER_DIGEST=daily) ──────────
   El cron lo dispara una vez al día; la deduplicación reutiliza
   el unique de payment_events (provider='owner_digest'). */
export async function maybeSendOwnerDigest(db: SupabaseClient): Promise<boolean> {
  const duena = await ownerCfg();
  if (duena.digest !== "daily" || !duena.email) return false;
  if (!duena.avisos.mensajes_auto) return false; // apagó la copia de mensajes automáticos
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: SITE.timezone });
  const { error } = await db.from("payment_events").insert({
    provider: "owner_digest",
    event_id: hoy,
    payload: {},
  });
  if (error) return false; // 23505 → ya se envió hoy

  const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await db
    .from("scheduled_messages")
    .select("template_key, channel, sent_at, reservations(guest_name, check_in)")
    .eq("status", "sent")
    .gt("sent_at", desde)
    .order("sent_at");
  const filas = (data ?? []).map((m) => {
    const r = Array.isArray(m.reservations) ? m.reservations[0] : m.reservations;
    return `· ${m.template_key} (${m.channel}) → ${r?.guest_name ?? "huésped"}`;
  });
  if (!filas.length) return false;

  await sendBrandedEmail({
    to: duena.email,
    subject: `[${SITE.name}] Resumen diario — ${filas.length} mensajes enviados`,
    text: `Mensajes automáticos enviados a huéspedes en las últimas 24 h:\n\n${filas.join("\n")}`,
  }).catch((e) => console.error("[owner-digest]", e));
  return true;
}

/* ── Acciones firmadas de un solo uso (Etapa 19-B) ──────────
   "Confirmar pago recibido" / "Rechazar" desde el email del
   comprobante, sin login. El token firma reserva+acción; el
   "un solo uso" lo garantiza el estado: solo opera sobre
   reservas pending con comprobante en revisión. */

const ACTIONS = ["confirmar", "rechazar"] as const;
export type OwnerAction = (typeof ACTIONS)[number];

function secret(): string {
  const s = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!s) throw new Error("INTERNAL_WEBHOOK_SECRET is not set (see .env.example)");
  return s;
}

const sign = (payload: string) =>
  createHmac("sha256", secret()).update(payload).digest("base64url");

/* El token vence a las 72 h (mismo plazo que el link firmado al comprobante):
   un correo reenviado o archivado no sirve para siempre. El vencimiento va
   DENTRO de la firma, así que no se puede alargar editando el link. */
export const OWNER_ACTION_TTL_SECONDS = 72 * 3600;

export function makeOwnerActionToken(
  reservationId: string,
  action: OwnerAction,
  now: number = Date.now()
): string {
  const id = Buffer.from(reservationId, "utf8").toString("base64url");
  const exp = Math.floor(now / 1000) + OWNER_ACTION_TTL_SECONDS;
  return `${id}.${action}.${exp}.${sign(`${reservationId}:${action}:${exp}`)}`;
}

/**
 * null = token inválido (formato o firma). Si la firma es buena pero ya
 * venció, devuelve `expired: true` para que la página lo diga con claridad.
 */
export function verifyOwnerActionToken(
  token: string,
  now: number = Date.now()
): { reservationId: string; action: OwnerAction; expired: boolean } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [idB64, action, expStr, sig] = parts;
  if (!ACTIONS.includes(action as OwnerAction)) return null;
  if (!/^\d{1,12}$/.test(expStr)) return null;
  let reservationId: string;
  try {
    reservationId = Buffer.from(idB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(reservationId)) return null;
  const expected = Buffer.from(sign(`${reservationId}:${action}:${expStr}`));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  const expired = Math.floor(now / 1000) > Number(expStr);
  return { reservationId, action: action as OwnerAction, expired };
}
