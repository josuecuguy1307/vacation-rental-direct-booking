import type { SupabaseClient } from "@supabase/supabase-js";
import { TEMPLATES, type MessageTemplate, type TemplateKey } from "@/lib/messaging/templates";

/* ============================================================
   Utilidades del panel de la dueña (Etapa 20): auditoría,
   settings editables (con los defaults del código como base
   inmutable) y timeline configurable.
   ============================================================ */

/** Registra una mutación en el log de auditoría (no lanza). */
export async function logAudit(
  db: SupabaseClient,
  entry: { actor: string; action: string; entity: string; entityId?: string; detail?: unknown }
): Promise<void> {
  const { error } = await db.from("audit_log").insert({
    actor: entry.actor,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    detail: entry.detail ?? null,
  });
  if (error) console.error("[audit]", error.message);
}

export async function getSetting<T>(db: SupabaseClient, key: string): Promise<T | null> {
  const { data } = await db.from("app_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? null;
}

export async function setSetting(db: SupabaseClient, key: string, value: unknown): Promise<void> {
  const { error } = await db
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

/* ── Plantillas efectivas: default del código + override editable ── */
export type TemplateOverrides = Partial<Record<TemplateKey, Partial<MessageTemplate>>>;

export async function getEffectiveTemplates(
  db: SupabaseClient
): Promise<Record<TemplateKey, MessageTemplate>> {
  const overrides = (await getSetting<TemplateOverrides>(db, "templates")) ?? {};
  const out = {} as Record<TemplateKey, MessageTemplate>;
  for (const key of Object.keys(TEMPLATES) as TemplateKey[]) {
    out[key] = { ...TEMPLATES[key], ...(overrides[key] ?? {}) };
  }
  return out;
}

/** Placeholders permitidos al editar plantillas (validación del editor). */
export const ALLOWED_PLACEHOLDERS = [
  "nombre", "codigo", "fecha_checkin", "fecha_checkout", "hora_checkin",
  "hora_checkout", "huespedes", "maps_link", "wifi_nombre", "wifi_clave",
  "review_link", "whatsapp_anfitrion", "total", "pagado", "saldo",
  "saldo_frase", "saldo_info", "link_saldo", "link_snacks",
];

export function validateTemplateText(text: string): string | null {
  if (!text.trim()) return "El texto no puede quedar vacío";
  const used = [...text.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
  const bad = used.find((u) => !ALLOWED_PLACEHOLDERS.includes(u));
  if (bad) return `Variable desconocida: {${bad}} — revisa la lista de variables`;
  if (/\{[^a-z{]|\{\{|\}\}/.test(text)) return "Hay llaves { } mal cerradas";
  return null;
}

/* ── Timeline configurable ──────────────────────────────────
   anchor fijo por mensaje; la dueña edita días de offset, hora
   y on/off. El default del código es inmutable (restaurable). */
export type TimelineItemCfg = { offsetDays: number; time: string; enabled: boolean };
export type TimelineCfg = Record<string, TimelineItemCfg>;

export const DEFAULT_TIMELINE: Record<
  string,
  TimelineItemCfg & { anchor: "checkin" | "checkout" | "confirm"; label: string }
> = {
  confirmacion:          { anchor: "confirm",  offsetDays: 0,  time: "00:00", enabled: true, label: "Confirmación (inmediato)" },
  antes_llegada:         { anchor: "checkin",  offsetDays: -1, time: "15:00", enabled: true, label: "Antes de la llegada" },
  recordatorio_saldo:    { anchor: "checkin",  offsetDays: 0,  time: "12:00", enabled: true, label: "Recordatorio de saldo (si hay saldo)" },
  dueno_checkin:         { anchor: "checkin",  offsetDays: 0,  time: "08:00", enabled: true, label: "Aviso a la dueña: hoy llega" },
  despues_primera_noche: { anchor: "checkin",  offsetDays: 1,  time: "10:30", enabled: true, label: "Después de la primera noche" },
  antes_salida:          { anchor: "checkout", offsetDays: -1, time: "18:00", enabled: true, label: "Antes de la salida" },
  dueno_checkout:        { anchor: "checkout", offsetDays: 0,  time: "08:00", enabled: true, label: "Aviso a la dueña: hoy sale" },
  despues_salida:        { anchor: "checkout", offsetDays: 0,  time: "16:00", enabled: true, label: "Después de la salida (reseña)" },
};

export async function getEffectiveTimeline(db: SupabaseClient): Promise<TimelineCfg> {
  const overrides = (await getSetting<TimelineCfg>(db, "timeline")) ?? {};
  const out: TimelineCfg = {};
  for (const [key, def] of Object.entries(DEFAULT_TIMELINE)) {
    const o = overrides[key] ?? {};
    out[key] = {
      offsetDays: Number.isInteger(o.offsetDays) ? o.offsetDays : def.offsetDays,
      time: /^\d{2}:\d{2}$/.test(o.time ?? "") ? o.time : def.time,
      enabled: typeof o.enabled === "boolean" ? o.enabled : def.enabled,
    };
  }
  return out;
}

/* ── Datos bancarios y contacto de la dueña (con fallback a env) ── */
export type BancoCfg = {
  bank_name: string; account_type: string; account_number: string;
  account_holder: string; holder_id: string;
};

export async function getBanco(db: SupabaseClient): Promise<BancoCfg> {
  const s = await getSetting<Partial<BancoCfg>>(db, "banco");
  return {
    bank_name: s?.bank_name ?? process.env.BANK_NAME ?? "",
    account_type: s?.account_type ?? process.env.BANK_ACCOUNT_TYPE ?? "",
    account_number: s?.account_number ?? process.env.BANK_ACCOUNT_NUMBER ?? "",
    account_holder: s?.account_holder ?? process.env.BANK_ACCOUNT_HOLDER ?? "",
    holder_id: s?.holder_id ?? process.env.BANK_HOLDER_ID ?? "",
  };
}

/* Qué avisos recibe la dueña (editable en Notificaciones). Cada uno se puede
   apagar; el default es TODO encendido, para respetar el comportamiento previo. */
export type AvisoTipo = "reserva_nueva" | "pago" | "cancelacion" | "mensajes_auto";
export const AVISO_TIPOS: AvisoTipo[] = ["reserva_nueva", "pago", "cancelacion", "mensajes_auto"];
export type AvisosCfg = Record<AvisoTipo, boolean>;
export const DEFAULT_AVISOS: AvisosCfg = {
  reserva_nueva: true, pago: true, cancelacion: true, mensajes_auto: true,
};

export type DuenaCfg = {
  email: string; whatsapp: string; digest: "instant" | "daily"; review_link: string;
  avisos: AvisosCfg;
};
export async function getDuena(db: SupabaseClient): Promise<DuenaCfg> {
  const s = await getSetting<Partial<DuenaCfg>>(db, "duena");
  const a = (s?.avisos ?? {}) as Partial<AvisosCfg>;
  return {
    email: s?.email ?? process.env.OWNER_EMAIL ?? "",
    whatsapp: s?.whatsapp ?? process.env.OWNER_WHATSAPP ?? "",
    digest: s?.digest === "daily" ? "daily" : (process.env.OWNER_DIGEST === "daily" ? "daily" : "instant"),
    review_link: s?.review_link ?? process.env.REVIEW_LINK ?? "",
    // cada aviso está encendido salvo que se haya guardado explícitamente en false
    avisos: {
      reserva_nueva: a.reserva_nueva !== false,
      pago: a.pago !== false,
      cancelacion: a.cancelacion !== false,
      mensajes_auto: a.mensajes_auto !== false,
    },
  };
}
