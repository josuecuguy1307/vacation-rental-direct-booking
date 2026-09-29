import { describe, expect, it, vi } from "vitest";
import { TEMPLATES, missingPlaceholders, renderTemplate, type TemplateKey } from "./templates";
import { computeSchedule } from "./schedule";
import { PdfReceiptGenerator } from "@/lib/pdf/receipt";

// Los horarios dependen de SITE.timezone: estos tests fijan una zona concreta (UTC-5, sin DST).
vi.mock("@/config/site.config", async (orig) => {
  const mod = await orig<typeof import("@/config/site.config")>();
  return { ...mod, SITE: { ...mod.SITE, timezone: "America/Bogota" } };
});

/**
 * Tests de la mensajería al huésped (Etapa 11): plantillas, cálculo del
 * timeline (zona horaria fija UTC-5, confirmaciones tardías) y recibo PDF.
 */

const FULL_VARS: Record<string, string> = {
  nombre: "Ana",
  codigo: "A1B2C3D4",
  fecha_checkin: "viernes, 10 de julio de 2026",
  fecha_checkout: "lunes, 13 de julio de 2026",
  hora_checkin: "15h00",
  hora_checkout: "11h00",
  huespedes: "6",
  maps_link: "https://maps.google.com/?q=-1.5,-78.0",
  wifi_nombre: "MiCasaWifi",
  wifi_clave: "clave-wifi-ejemplo",
  review_link: "https://example.com/resena",
  whatsapp_anfitrion: "+00 000 000 000",
  total: "$475.00",
  pagado: "$475.00",
  saldo: "$0.00",
  saldo_frase: "Tu estadía está pagada por completo ✓",
  saldo_info: "",
  link_saldo: "https://ppls.me/x",
  link_snacks: "https://example.com/snacks?t=tok",
};

describe("templates", () => {
  const keys = Object.keys(TEMPLATES) as TemplateKey[];

  it("existen las 6 plantillas del timeline", () => {
    expect(keys.sort()).toEqual([
      "antes_llegada", "antes_salida", "confirmacion",
      "despues_primera_noche", "despues_salida", "recordatorio_saldo",
    ]);
  });

  it.each(keys)("%s: asunto/email/whatsapp renderizan sin placeholders sueltos", (key) => {
    const t = TEMPLATES[key];
    for (const txt of [t.asunto, t.email, t.whatsapp]) {
      const rendered = renderTemplate(txt, FULL_VARS);
      expect(missingPlaceholders(rendered)).toEqual([]);
      expect(rendered).not.toContain("{");
    }
  });

  it("antes_llegada incluye hora, maps y wifi; despues_salida incluye review", () => {
    const llegada = renderTemplate(TEMPLATES.antes_llegada.email, FULL_VARS);
    expect(llegada).toContain("15h00");
    expect(llegada).toContain(FULL_VARS.maps_link);
    expect(llegada).toContain("MiCasaWifi");
    expect(llegada).toContain("clave-wifi-ejemplo");
    const salida = renderTemplate(TEMPLATES.despues_salida.whatsapp, FULL_VARS);
    expect(salida).toContain(FULL_VARS.review_link);
  });

  it("un placeholder sin variable queda visible y detectable", () => {
    const r = renderTemplate("Hola {nombre} {desconocido}", { nombre: "Ana" });
    expect(r).toBe("Hola Ana {desconocido}");
    expect(missingPlaceholders(r)).toEqual(["desconocido"]);
  });
});

describe("computeSchedule (zona fija UTC-5)", () => {
  // confirmación normal: 1 mes antes de la estadía 10→13 jul
  const now = new Date("2026-06-10T15:00:00Z");

  it("reserva futura → timeline completo con horas locales correctas", () => {
    const items = computeSchedule("2026-07-10", "2026-07-13", now);
    const byKey = Object.fromEntries(items.map((i) => [i.template_key, i.send_at]));

    expect(items).toHaveLength(8); // 5 del huésped + recordatorio_saldo + 2 de la dueña
    expect(byKey.confirmacion).toBe(now.toISOString());
    // 9 jul 15h00 (UTC-5) = 20:00 UTC
    expect(byKey.antes_llegada).toBe("2026-07-09T20:00:00.000Z");
    // 11 jul 10h30 (UTC-5) = 15:30 UTC
    expect(byKey.despues_primera_noche).toBe("2026-07-11T15:30:00.000Z");
    // 12 jul 18h00 Ecuador = 23:00 UTC
    expect(byKey.antes_salida).toBe("2026-07-12T23:00:00.000Z");
    // 13 jul 16h00 Ecuador = 21:00 UTC
    expect(byKey.despues_salida).toBe("2026-07-13T21:00:00.000Z");
    // Etapas 17/19: recordatorio de saldo (12h) y recordatorios de la dueña (08h)
    expect(byKey.recordatorio_saldo).toBe("2026-07-10T17:00:00.000Z");
    expect(byKey.dueno_checkin).toBe("2026-07-10T13:00:00.000Z");
    expect(byKey.dueno_checkout).toBe("2026-07-13T13:00:00.000Z");
  });

  it("confirmación same-day (mañana del check-in) → antes_llegada se manda YA", () => {
    const morning = new Date("2026-07-10T13:00:00Z"); // 8h00 de Ecuador, día del check-in
    const items = computeSchedule("2026-07-10", "2026-07-13", morning);
    const byKey = Object.fromEntries(items.map((i) => [i.template_key, i.send_at]));
    expect(byKey.antes_llegada).toBe(morning.toISOString()); // clamp a ahora
    const keys = items.map((i) => i.template_key);
    for (const k of ["confirmacion", "despues_primera_noche", "antes_salida", "despues_salida"]) {
      expect(keys).toContain(k);
    }
  });

  it("confirmación a mitad de estadía → no pregunta por la primera noche pasada", () => {
    const midStay = new Date("2026-07-12T15:00:00Z"); // 12 jul, 10h de Ecuador
    const keys = computeSchedule("2026-07-10", "2026-07-13", midStay).map((i) => i.template_key);
    expect(keys).toContain("confirmacion");
    expect(keys).not.toContain("antes_llegada");          // el check-in ya pasó
    expect(keys).not.toContain("despues_primera_noche");  // ya quedó atrás
    expect(keys).toContain("antes_salida");               // 12 jul 18h aún no llega
    expect(keys).toContain("despues_salida");
  });

  it("confirmación después del check-out → solo confirmacion", () => {
    const after = new Date("2026-07-20T12:00:00Z");
    const keys = computeSchedule("2026-07-10", "2026-07-13", after).map((i) => i.template_key);
    expect(keys).toEqual(["confirmacion"]);
  });
});

describe("recibo PDF", () => {
  it("genera un PDF válido con el desglose por temporada", async () => {
    const bytes = await new PdfReceiptGenerator().generate({
      reservationId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      guestName: "Ana Pérez",
      guestEmail: "ana@mail.com",
      checkIn: "2026-12-22",
      checkOut: "2026-12-26",
      checkInTime: "15h00",
      checkOutTime: "11h00",
      guests: 6,
      nights: 4,
      nightly: [
        { date: "2026-12-22", base_price: 100, season: null, extra_guests_fee: 50 },
        { date: "2026-12-23", base_price: 100, season: null, extra_guests_fee: 50 },
        { date: "2026-12-24", base_price: 130, season: "Navidad y Fin de año", extra_guests_fee: 50 },
        { date: "2026-12-25", base_price: 130, season: "Navidad y Fin de año", extra_guests_fee: 50 },
      ],
      lodgingTotal: 660,
      extrasTotal: 0,
      cleaningFee: 17,
      total: 677,
      depositPaid: 203.1,
      paymentMethod: "payphone",
      propertyName: "Mi Casa Vacacional",
    });

    expect(bytes.length).toBeGreaterThan(1000);
    // cabecera %PDF
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("sin desglose nightly usa el subtotal plano", async () => {
    const bytes = await new PdfReceiptGenerator().generate({
      reservationId: "b2c3d4e5-0000-4000-8000-000000000001",
      guestName: "Luis",
      guestEmail: "luis@mail.com",
      checkIn: "2026-08-01",
      checkOut: "2026-08-03",
      checkInTime: "15h00",
      checkOutTime: "11h00",
      guests: 4,
      nights: 2,
      nightly: null,
      lodgingTotal: 200,
      extrasTotal: 0,
      cleaningFee: 17,
      total: 217,
      depositPaid: 65.1,
      paymentMethod: "bank_transfer",
      propertyName: "Mi Casa Vacacional",
    });
    expect(bytes.length).toBeGreaterThan(800);
  });
});
