import { SITE } from "@/config/site.config";
/**
 * iCal — export (feed para Airbnb/Booking) e import (parser de feeds externos).
 * Solo eventos all-day con DTSTART/DTEND;VALUE=DATE, que es lo que usan las OTAs.
 */

export type IcalEvent = {
  uid: string;
  start: string;   // YYYY-MM-DD
  end: string;     // YYYY-MM-DD (exclusivo, como daterange '[)')
  summary?: string;
};

const toIcalDate = (d: string) => d.replaceAll("-", "");
const fromIcalDate = (d: string) =>
  `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Genera un calendario .ics con las reservas confirmadas. */
export function buildIcalFeed(calendarName: string, events: IcalEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${SITE.name}//Reservas//ES`,
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const ev of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}`,
      `DTSTART;VALUE=DATE:${toIcalDate(ev.start)}`,
      `DTEND;VALUE=DATE:${toIcalDate(ev.end)}`,
      `SUMMARY:${escapeText(ev.summary ?? "Reservado")}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/**
 * Parser mínimo de VEVENTs all-day (suficiente para feeds de Airbnb/Booking).
 * Ignora eventos sin UID o sin fechas.
 */
export function parseIcalFeed(ics: string): IcalEvent[] {
  // des-plegado de líneas (RFC 5545: continuación = línea que empieza con espacio/tab)
  const unfolded = ics.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);

  const events: IcalEvent[] = [];
  let current: Partial<IcalEvent> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { current = {}; continue; }
    if (line === "END:VEVENT") {
      if (current?.uid && current.start && current.end) {
        events.push(current as IcalEvent);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).split(";")[0].toUpperCase();
    const value = line.slice(idx + 1).trim();

    if (key === "UID") current.uid = value;
    else if (key === "SUMMARY") current.summary = value;
    else if (key === "DTSTART") current.start = fromIcalDate(value.slice(0, 8));
    else if (key === "DTEND") current.end = fromIcalDate(value.slice(0, 8));
  }
  return events.filter((e) => e.end > e.start);
}
