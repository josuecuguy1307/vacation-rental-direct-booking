import { SITE } from "@/config/site.config";

/**
 * "Hoy" en la zona horaria de la propiedad (SITE.timezone).
 * El calendario del cliente trabaja con fechas locales; si el servidor
 * compara contra la fecha UTC, al caer la tarde en zonas al oeste de UTC
 * "hoy" ya es "mañana" y una reserva del mismo día válida se rechaza como pasada.
 */
export const PROPERTY_TZ = SITE.timezone;

/** YYYY-MM-DD de hoy en la zona horaria de la propiedad. */
export function todayInPropertyTz(): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: PROPERTY_TZ }).format(new Date());
}

/** Desfase (ms) de `tz` respecto de UTC en el instante `at`. */
function tzOffsetMs(at: Date, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at).map((x) => [x.type, x.value])
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * Instante real para "fecha + hora de pared" en la zona de la propiedad
 * (respeta horario de verano). `date` = YYYY-MM-DD, `time` = HH:MM.
 */
export function zonedTimeToDate(date: string, time: string, tz: string = PROPERTY_TZ): Date {
  const guess = Date.parse(`${date}T${time}:00Z`);
  let t = guess - tzOffsetMs(new Date(guess), tz);
  t = guess - tzOffsetMs(new Date(t), tz); // 2ª pasada: corrige si cruzó un cambio de hora
  return new Date(t);
}
