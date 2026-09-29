import { describe, expect, it } from "vitest";
import { baseForNight, computeQuote, type SeasonRow } from "./pricing";

/**
 * Tests del motor de precios por temporada (Etapa 8).
 * Modelo: base $100/noche (cubre 4) que varía por season; huésped extra
 * (5to-8vo) +$25/noche fijo; limpieza $17 por estadía; anticipo 30%.
 */

/* Fixture sin split (weekday = weekend) para los tests del modelo base */
const NAVIDAD: SeasonRow = {
  name: "Navidad y Fin de año",
  date_start: "2026-12-24",
  date_end: "2027-01-04",
  weekday_price_cents: 13000,
  weekend_price_cents: 13000,
  priority: 10,
};

const baseParams = {
  // defaults planos (sin split) para que los tests del modelo base sean estables
  defaultWeekdayCents: 10000,
  defaultWeekendCents: 10000,
  extraGuestCents: 2500,
  includedGuests: 4,
  maxGuests: 8,
  cleaningFee: 17,
  depositPercentage: 30,
  checkIn: "2026-07-10",
  checkOut: "2026-07-13", // 3 noches, sin season
  adults: 4,
  children: 0,
  seasons: [] as SeasonRow[],
  addons: [],
  selections: [],
};

describe("noches sin season (default)", () => {
  it("usa el base default $100 y suma limpieza", () => {
    const q = computeQuote(baseParams);
    expect(q.nights).toBe(3);
    expect(q.nightly.map((n) => n.base_price)).toEqual([100, 100, 100]);
    expect(q.nightly.every((n) => n.season === null)).toBe(true);
    expect(q.base_lodging_total).toBe(300);
    expect(q.extra_guests_total).toBe(0);
    expect(q.lodging_total).toBe(300);
    expect(q.cleaning_fee).toBe(17);
    expect(q.total).toBe(317);
    expect(q.deposit_amount).toBe(95.1); // 30% de 317
  });
});

describe("estadía que cruza dos temporadas", () => {
  it("cobra cada noche con el base de su season", () => {
    // 22 y 23 dic: default $100 · 24 y 25 dic: Navidad $130
    const q = computeQuote({
      ...baseParams,
      checkIn: "2026-12-22",
      checkOut: "2026-12-26",
      seasons: [NAVIDAD],
    });
    expect(q.nightly).toEqual([
      { date: "2026-12-22", base_price: 100, season: null, weekend: false, extra_guests_fee: 0 },
      { date: "2026-12-23", base_price: 100, season: null, weekend: false, extra_guests_fee: 0 },
      { date: "2026-12-24", base_price: 130, season: "Navidad y Fin de año", weekend: false, extra_guests_fee: 0 },
      { date: "2026-12-25", base_price: 130, season: "Navidad y Fin de año", weekend: true, extra_guests_fee: 0 },
    ]);
    expect(q.base_lodging_total).toBe(460);
    expect(q.total).toBe(477);
  });

  it("date_end es exclusivo: la noche que empieza en date_end ya no es de la season", () => {
    const q = computeQuote({
      ...baseParams,
      checkIn: "2027-01-03",
      checkOut: "2027-01-05",
      seasons: [NAVIDAD],
    });
    expect(q.nightly[0]).toMatchObject({ date: "2027-01-03", base_price: 130 });
    expect(q.nightly[1]).toMatchObject({ date: "2027-01-04", base_price: 100, season: null });
  });

  it("la noche del check-out no se cobra (intervalo '[)')", () => {
    // check-out el 24: la noche del 24 (Navidad) no nos pertenece
    const q = computeQuote({
      ...baseParams,
      checkIn: "2026-12-22",
      checkOut: "2026-12-24",
      seasons: [NAVIDAD],
    });
    expect(q.nights).toBe(2);
    expect(q.base_lodging_total).toBe(200);
  });
});

describe("huéspedes: 4 vs 6 vs 8, y el 9no se rechaza", () => {
  it("4 huéspedes: cubiertos por el base, sin extras", () => {
    const q = computeQuote({ ...baseParams, adults: 2, children: 2 });
    expect(q.extra_guests).toBe(0);
    expect(q.lodging_total).toBe(300);
  });

  it("6 huéspedes: 2 extras × $25 × noche", () => {
    const q = computeQuote({ ...baseParams, adults: 4, children: 2 });
    expect(q.extra_guests).toBe(2);
    expect(q.extra_guests_total).toBe(2 * 25 * 3);
    expect(q.lodging_total).toBe(300 + 150);
    expect(q.total).toBe(450 + 17);
  });

  it("8 huéspedes: 4 extras × $25 × noche", () => {
    const q = computeQuote({ ...baseParams, adults: 6, children: 2 });
    expect(q.extra_guests).toBe(4);
    expect(q.extra_guests_total).toBe(4 * 25 * 3);
    expect(q.lodging_total).toBe(600);
  });

  it("los niños cuentan como huéspedes para los extras (5 con 1 niño → 1 extra)", () => {
    const q = computeQuote({ ...baseParams, adults: 4, children: 1 });
    expect(q.extra_guests).toBe(1);
    expect(q.extra_guests_total).toBe(75);
  });

  it("9 huéspedes: rechazado", () => {
    expect(() => computeQuote({ ...baseParams, adults: 9 })).toThrow("Máximo 8 huéspedes");
    expect(() => computeQuote({ ...baseParams, adults: 5, children: 4 })).toThrow(
      "Máximo 8 huéspedes"
    );
  });

  it("el extra por huésped NO varía por temporada", () => {
    const q = computeQuote({
      ...baseParams,
      checkIn: "2026-12-24",
      checkOut: "2026-12-26",
      adults: 6,
      seasons: [NAVIDAD],
    });
    expect(q.nightly.every((n) => n.extra_guests_fee === 50)).toBe(true); // 2 × $25
    expect(q.lodging_total).toBe(130 * 2 + 50 * 2);
  });
});

describe("resolución de seasons solapadas", () => {
  const DEFAULTS = { weekdayCents: 10000, weekendCents: 10000 };
  const carnaval: SeasonRow = {
    name: "Carnaval",
    date_start: "2026-02-13",
    date_end: "2026-02-18",
    weekday_price_cents: 13000,
    weekend_price_cents: 13000,
    priority: 10,
  };
  const oferta: SeasonRow = {
    name: "Oferta flash",
    date_start: "2026-02-15",
    date_end: "2026-02-16",
    weekday_price_cents: 9000,
    weekend_price_cents: 9000,
    priority: 20,
  };

  it("gana la season de mayor priority", () => {
    expect(baseForNight("2026-02-15", [carnaval, oferta], DEFAULTS)).toMatchObject({
      cents: 9000,
      season: "Oferta flash",
    });
    expect(baseForNight("2026-02-14", [carnaval, oferta], DEFAULTS)).toMatchObject({
      cents: 13000,
      season: "Carnaval",
    });
  });

  it("empate de priority: gana la de date_start más reciente", () => {
    const a = { ...carnaval, priority: 10 };
    const b = { ...oferta, priority: 10 };
    expect(baseForNight("2026-02-15", [a, b], DEFAULTS).season).toBe("Oferta flash");
  });
});

describe("split semana / fin de semana (Etapa 8.5)", () => {
  // valores reales del cliente: default $110 dom-jue · $115 vie-sáb
  const SPLIT = { weekdayCents: 11000, weekendCents: 11500 };
  // Navidad con split alta: $115 / $120 (weekend $120 CONFIRMADO)
  const NAVIDAD_SPLIT: SeasonRow = {
    name: "Navidad y Fin de año",
    date_start: "2026-12-24",
    date_end: "2027-01-04",
    weekday_price_cents: 11500,
    weekend_price_cents: 12000,
    priority: 10,
  };
  const splitParams = {
    ...baseParams,
    defaultWeekdayCents: 11000,
    defaultWeekendCents: 11500,
  };

  it("noche de viernes cobra weekend, martes cobra weekday y domingo es weekday", () => {
    // 2026-07-10 = viernes · 2026-07-14 = martes · 2026-07-12 = domingo
    expect(baseForNight("2026-07-10", [], SPLIT)).toEqual({ cents: 11500, season: null, weekend: true });
    expect(baseForNight("2026-07-14", [], SPLIT)).toEqual({ cents: 11000, season: null, weekend: false });
    expect(baseForNight("2026-07-12", [], SPLIT)).toEqual({ cents: 11000, season: null, weekend: false });
  });

  it("estadía que cruza weekday → weekend: mié+jue a $110, vie+sáb a $115", () => {
    // 8 jul 2026 = miércoles → noches mié, jue, vie, sáb
    const q = computeQuote({ ...splitParams, checkIn: "2026-07-08", checkOut: "2026-07-12" });
    expect(q.nightly.map((n) => [n.date, n.base_price, n.weekend])).toEqual([
      ["2026-07-08", 110, false],
      ["2026-07-09", 110, false],
      ["2026-07-10", 115, true],
      ["2026-07-11", 115, true],
    ]);
    expect(q.base_lodging_total).toBe(110 * 2 + 115 * 2);
    expect(q.total).toBe(450 + 17);
  });

  it("estadía que cruza dos seasons con split: default y Navidad, cada una con su tarifa por día", () => {
    // 23 dic 2026 = miércoles (default weekday $110) · 24 = jueves (Navidad weekday $115)
    // 25 = viernes (Navidad weekend $120) · 26 = sábado (Navidad weekend $120)
    const q = computeQuote({
      ...splitParams,
      checkIn: "2026-12-23",
      checkOut: "2026-12-27",
      seasons: [NAVIDAD_SPLIT],
    });
    expect(q.nightly.map((n) => [n.base_price, n.season, n.weekend])).toEqual([
      [110, null, false],
      [115, "Navidad y Fin de año", false],
      [120, "Navidad y Fin de año", true],
      [120, "Navidad y Fin de año", true],
    ]);
    expect(q.base_lodging_total).toBe(110 + 115 + 120 + 120);
    expect(q.total).toBe(465 + 17);
  });

  it("los extras por huésped no cambian con el split (mismo precio toda la semana)", () => {
    const q = computeQuote({
      ...splitParams,
      checkIn: "2026-07-08",
      checkOut: "2026-07-12",
      adults: 6,
    });
    expect(q.nightly.every((n) => n.extra_guests_fee === 50)).toBe(true); // 2 × $25
    expect(q.extra_guests_total).toBe(2 * 25 * 4);
  });
});

describe("addons (cajita) y validaciones", () => {
  it("per_person multiplica por todos los huéspedes; per_night por noches", () => {
    const q = computeQuote({
      ...baseParams,
      adults: 3,
      children: 2,
      addons: [
        { id: "a1", price: 8, type: "per_person" },
        { id: "a2", price: 12, type: "per_night" },
        { id: "a3", price: 2.5, type: "per_stay" },
      ],
      selections: [
        { addon_id: "a1", quantity: 1 },
        { addon_id: "a2", quantity: 1 },
        { addon_id: "a3", quantity: 2 },
      ],
    });
    expect(q.extras_total).toBe(8 * 5 + 12 * 3 + 2.5 * 2);
    // 5 huéspedes → 1 extra: 300 + 75
    expect(q.total).toBe(375 + q.extras_total + 17);
  });

  it("addon inexistente: rechazado", () => {
    expect(() =>
      computeQuote({ ...baseParams, selections: [{ addon_id: "nope", quantity: 1 }] })
    ).toThrow("Addon no disponible");
  });

  it("rango inválido y adultos < 1: rechazados", () => {
    expect(() => computeQuote({ ...baseParams, checkOut: baseParams.checkIn })).toThrow();
    expect(() => computeQuote({ ...baseParams, adults: 0 })).toThrow();
  });

  it("estadía más larga que MAX_NIGHTS: rechazada", () => {
    expect(() =>
      computeQuote({ ...baseParams, checkIn: "2026-07-10", checkOut: "2026-09-10" })
    ).toThrow("Estadía máxima");
  });

  it("centavos exactos: 30% de totales con decimales", () => {
    // 1 noche $130 + limpieza $17 = $147 → anticipo $44.10
    const q = computeQuote({
      ...baseParams,
      checkIn: "2026-12-24",
      checkOut: "2026-12-25",
      seasons: [NAVIDAD],
    });
    expect(q.total).toBe(147);
    expect(q.deposit_amount).toBe(44.1);
  });
});

describe("mascota y garantía reembolsable (Lane 2)", () => {
  it("sin mascota ni garantía: totales idénticos al modelo base (compat)", () => {
    const q = computeQuote(baseParams);
    expect(q.pets).toBe(0);
    expect(q.pets_total).toBe(0);
    expect(q.guarantee).toBe(0);
    expect(q.total).toBe(317);
    expect(q.deposit_amount).toBe(95.1);
  });

  it("suma $16 por mascota (parte de la estadía, sujeta al anticipo)", () => {
    const q = computeQuote({ ...baseParams, petCount: 2, petPriceCents: 1600 });
    // base 300 + limpieza 17 + mascotas 32 = 349
    expect(q.pets).toBe(2);
    expect(q.pet_unit_price).toBe(16);
    expect(q.pets_total).toBe(32);
    expect(q.total).toBe(349);
    expect(q.deposit_amount).toBe(104.7); // 30% de 349
  });

  it("la garantía se cobra COMPLETA en el anticipo y no se prorratea", () => {
    const q = computeQuote({ ...baseParams, guaranteeCents: 3000 });
    // base 317 (300 + 17) → total 317 + 30 = 347
    expect(q.guarantee).toBe(30);
    expect(q.total).toBe(347);
    // anticipo = 30% de 317 + 30 completo = 95.1 + 30 = 125.1
    expect(q.deposit_amount).toBe(125.1);
    // saldo = total − anticipo = 221.9 = 70% de la base (la garantía queda saldada)
    expect(Math.round((q.total - q.deposit_amount) * 100) / 100).toBe(221.9);
  });

  it("mascota + garantía juntas, y el desglose reconcilia el total", () => {
    const q = computeQuote({
      ...baseParams,
      petCount: 1,
      petPriceCents: 1600,
      guaranteeCents: 3000,
    });
    // 300 aloj + 0 extras + 16 mascota + 17 limpieza + 30 garantía = 363
    expect(q.pets_total).toBe(16);
    expect(q.guarantee).toBe(30);
    expect(q.total).toBe(363);
    expect(
      q.lodging_total + q.extras_total + q.pets_total + q.cleaning_fee + q.guarantee
    ).toBe(q.total);
  });

  it("con anticipo 100% la garantía queda incluida en el total a pagar", () => {
    const q = computeQuote({
      ...baseParams,
      depositPercentage: 100,
      petCount: 1,
      petPriceCents: 1600,
      guaranteeCents: 3000,
    });
    expect(q.total).toBe(363);
    expect(q.deposit_amount).toBe(363); // todo se cobra para confirmar
  });
});
