import { describe, expect, it } from "vitest";
import { firstIssue, reservationBodySchema } from "./booking-schema";

/** Body válido de referencia (formulario completo de la Etapa 12). */
const VALID = {
  property_slug: "mi-casa",
  first_name: "Ana María",
  last_name: "Pérez López",
  document_type: "cedula",
  document: "0102030405",
  email: "ana@mail.com",
  phone: "+52 55 0000 0000",
  country: "Ecuador",
  arrival_time: "18h00 a 20h00",
  pet_count: 1,
  message: "Celebramos un cumpleaños",
  companions: ["Luis Pérez", "Sofía Pérez"],
  check_in: "2026-07-10",
  check_out: "2026-07-13",
  adults: 2,
  children: 1,
};

describe("reservationBodySchema", () => {
  it("acepta el payload completo y aplica trims/defaults", () => {
    const r = reservationBodySchema.safeParse({ ...VALID, first_name: "  Ana  " });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.first_name).toBe("Ana");
    expect(r.data.addons).toEqual([]); // default
  });

  it("message y companions son opcionales (defaults)", () => {
    const { message: _m, companions: _c, ...rest } = VALID;
    const r = reservationBodySchema.safeParse(rest);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.message).toBe("");
    expect(r.data.companions).toEqual([]);
  });

  it("cédula: exige 10 dígitos exactos", () => {
    const bad = reservationBodySchema.safeParse({ ...VALID, document: "12345" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(firstIssue(bad.error)).toContain("cédula");

    const letters = reservationBodySchema.safeParse({ ...VALID, document: "01020304AB" });
    expect(letters.success).toBe(false);
  });

  it("pasaporte: alfanumérico válido", () => {
    const r = reservationBodySchema.safeParse({
      ...VALID, document_type: "pasaporte", document: "AB123456",
    });
    expect(r.success).toBe(true);
  });

  it("más acompañantes que huéspedes → rechazado", () => {
    const r = reservationBodySchema.safeParse({
      ...VALID, adults: 1, children: 0,
      companions: ["Luis Pérez"], // titular + 1 nombre pero solo 1 huésped
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstIssue(r.error)).toContain("acompañantes");
  });

  it("teléfono inválido, franja desconocida y pet_count fuera de rango → rechazados", () => {
    expect(reservationBodySchema.safeParse({ ...VALID, phone: "abc" }).success).toBe(false);
    expect(reservationBodySchema.safeParse({ ...VALID, arrival_time: "a medianoche" }).success).toBe(false);
    expect(reservationBodySchema.safeParse({ ...VALID, pet_count: 5 }).success).toBe(false);
  });

  it("se requiere al menos 1 adulto y fechas con formato", () => {
    expect(reservationBodySchema.safeParse({ ...VALID, adults: 0 }).success).toBe(false);
    expect(reservationBodySchema.safeParse({ ...VALID, check_in: "10-07-2026" }).success).toBe(false);
  });
});
