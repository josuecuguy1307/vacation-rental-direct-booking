import { describe, expect, it } from "vitest";
import { computeBalanceCents } from "./balance";
import { computeQuote, type SeasonRow } from "./pricing";
import { makeOwnerActionToken, verifyOwnerActionToken } from "./owner-notify";

const baseParams = {
  defaultWeekdayCents: 11000,
  defaultWeekendCents: 11500,
  extraGuestCents: 2500,
  includedGuests: 4,
  maxGuests: 8,
  cleaningFee: 25,
  checkIn: "2026-07-08",   // mié → noches mié, jue, vie, sáb
  checkOut: "2026-07-12",
  adults: 4,
  children: 0,
  seasons: [] as SeasonRow[],
  addons: [],
  selections: [],
};

describe("Etapa 19-A: pago 100% vs anticipo 30%", () => {
  it("con DEPOSIT 100%: lo que se paga para confirmar ES el total y el saldo queda en 0", () => {
    const q = computeQuote({ ...baseParams, depositPercentage: 100 });
    expect(q.total).toBe(110 * 2 + 115 * 2 + 25);   // 475
    expect(q.deposit_amount).toBe(q.total);          // se confirma con el pago TOTAL
    expect(computeBalanceCents(q.total, q.deposit_amount)).toBe(0); // saldo dormido
  });

  it("con 30%: anticipo + saldo = total EXACTO en centavos (revive el flujo de saldo)", () => {
    const q = computeQuote({ ...baseParams, depositPercentage: 30 });
    const saldo = computeBalanceCents(q.total, q.deposit_amount);
    expect(saldo).toBeGreaterThan(0);
    expect(Math.round(q.deposit_amount * 100) + saldo).toBe(Math.round(q.total * 100));
  });

  it("redondeos con decimales: 30% de $482 → $144.60 + $337.40 = $482.00", () => {
    expect(computeBalanceCents(482, 144.6)).toBe(33740);
  });

  it("la limpieza nueva ($25) entra en el total", () => {
    const q = computeQuote({ ...baseParams, depositPercentage: 100 });
    expect(q.cleaning_fee).toBe(25);
  });
});

describe("Etapa 19-B: token firmado de la dueña (confirmar/rechazar sin login)", () => {
  const RID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

  it("round-trip confirmar y rechazar", () => {
    process.env.INTERNAL_WEBHOOK_SECRET = "secreto-test";
    const t1 = makeOwnerActionToken(RID, "confirmar");
    expect(verifyOwnerActionToken(t1)).toEqual({ reservationId: RID, action: "confirmar", expired: false });
    const t2 = makeOwnerActionToken(RID, "rechazar");
    expect(verifyOwnerActionToken(t2)).toEqual({ reservationId: RID, action: "rechazar", expired: false });
  });

  it("token con la acción cambiada (confirmar→rechazar) NO valida", () => {
    process.env.INTERNAL_WEBHOOK_SECRET = "secreto-test";
    const t = makeOwnerActionToken(RID, "confirmar");
    const [id, , sig] = t.split(".");
    expect(verifyOwnerActionToken(`${id}.rechazar.${sig}`)).toBeNull();
    expect(verifyOwnerActionToken("basura.confirmar.x")).toBeNull();
  });
});
