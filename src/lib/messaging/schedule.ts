import type { SupabaseClient } from "@supabase/supabase-js";
import type { TemplateKey } from "./templates";
import { zonedTimeToDate } from "@/lib/dates";
import { DEFAULT_TIMELINE, getEffectiveTimeline, type TimelineCfg } from "@/lib/panel";

/* ============================================================
   Programación del timeline de mensajes (estilo Airbnb).
   Al CONFIRMARSE una reserva se insertan filas en
   scheduled_messages; el cron de 15 min envía las vencidas.

   Horarios en la zona de la propiedad (SITE.timezone, con horario de verano
   si aplica):
     confirmacion           → inmediato
     antes_llegada          → 1 día antes del check-in, 15h00
     despues_primera_noche  → 1 día después del check-in, 10h30
     antes_salida           → 1 día antes del check-out, 18h00
     despues_salida         → día del check-out, 16h00 (por la tarde)
   ============================================================ */

const addDays = (date: string, n: number): string => {
  const t = Date.parse(date + "T00:00:00Z") + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
};

const atLocal = (date: string, time: string): Date => zonedTimeToDate(date, time);

/** dueno_* = recordatorios del día para la DUEÑA (Etapa 19-C) */
export type ScheduledKey = TemplateKey | "dueno_checkin" | "dueno_checkout";
export type ScheduledItem = { template_key: ScheduledKey; send_at: string };

/**
 * Calcula qué mensajes programar y cuándo (función pura, testeable).
 * `cfg` viene del panel (offsets/hora/on-off editables, Etapa 20-E);
 * sin cfg usa el DEFAULT_TIMELINE del código, que reproduce el
 * comportamiento histórico exacto.
 * Reglas para confirmaciones tardías:
 * - confirmacion: siempre, inmediata.
 * - antes_llegada: mientras el check-in no haya pasado; si su hora ideal ya
 *   pasó (reserva same-day), se manda ya (la info de llegada sigue siendo útil).
 * - el resto: solo si su hora aún no pasó (no tiene sentido preguntar por la
 *   primera noche de una estadía que ya terminó).
 */
export function computeSchedule(
  checkIn: string,
  checkOut: string,
  now: Date = new Date(),
  cfg?: TimelineCfg
): ScheduledItem[] {
  const t: TimelineCfg = {};
  for (const [k, def] of Object.entries(DEFAULT_TIMELINE)) {
    t[k] = cfg?.[k] ?? { offsetDays: def.offsetDays, time: def.time, enabled: def.enabled };
  }
  const anchorDate = (key: string) =>
    DEFAULT_TIMELINE[key].anchor === "checkout" ? checkOut : checkIn;
  const idealFor = (key: string) =>
    atLocal(addDays(anchorDate(key), t[key].offsetDays), t[key].time);

  const items: ScheduledItem[] = [];
  if (t.confirmacion.enabled) {
    items.push({ template_key: "confirmacion", send_at: now.toISOString() });
  }

  // antes_llegada con clamp same-day: si la hora ideal ya pasó pero el
  // check-in no, se manda ya
  if (t.antes_llegada.enabled && now < atLocal(checkIn, t.antes_llegada.time)) {
    const llegada = idealFor("antes_llegada");
    items.push({
      template_key: "antes_llegada",
      send_at: (llegada > now ? llegada : now).toISOString(),
    });
  }

  const futuros: ScheduledKey[] = [
    "despues_primera_noche", "antes_salida", "despues_salida",
    "recordatorio_saldo", "dueno_checkin", "dueno_checkout",
  ];
  for (const key of futuros) {
    if (!t[key].enabled) continue;
    const when = idealFor(key);
    if (when > now) items.push({ template_key: key, send_at: when.toISOString() });
  }

  return items;
}

/**
 * Inserta el timeline para una reserva confirmada. Idempotente: el unique
 * (reservation_id, template_key, channel) ignora duplicados si la
 * confirmación corre dos veces. Email siempre; WhatsApp solo si hay teléfono.
 */
export async function scheduleGuestMessages(
  db: SupabaseClient,
  reservation: { id: string; check_in: string; check_out: string; guest_phone?: string | null },
  now: Date = new Date()
): Promise<number> {
  // timeline editable desde el panel; si la lectura falla, defaults del código
  let cfg: TimelineCfg | undefined;
  try {
    cfg = await getEffectiveTimeline(db);
  } catch {
    cfg = undefined;
  }
  const items = computeSchedule(reservation.check_in, reservation.check_out, now, cfg);
  const guestChannels = reservation.guest_phone ? ["email", "whatsapp"] : ["email"];

  const rows = items.flatMap((it) => {
    // los recordatorios de la dueña van en UNA fila (el sender manda email+WA)
    const channels = it.template_key.startsWith("dueno_") ? ["email"] : guestChannels;
    return channels.map((channel) => ({
      reservation_id: reservation.id,
      template_key: it.template_key,
      channel,
      send_at: it.send_at,
      status: "pending",
    }));
  });

  const { error } = await db
    .from("scheduled_messages")
    .upsert(rows, { onConflict: "reservation_id,template_key,channel", ignoreDuplicates: true });
  if (error) {
    console.error("[messaging] no se pudo programar el timeline:", error.message);
    return 0;
  }
  return rows.length;
}

/** Cancela los mensajes pendientes de una reserva (al cancelarse/expirar). */
export async function cancelScheduledMessages(
  db: SupabaseClient,
  reservationId: string
): Promise<void> {
  const { error } = await db
    .from("scheduled_messages")
    .update({ status: "cancelled" })
    .eq("reservation_id", reservationId)
    .eq("status", "pending");
  if (error) {
    console.error("[messaging] no se pudieron cancelar mensajes:", error.message);
  }
}
