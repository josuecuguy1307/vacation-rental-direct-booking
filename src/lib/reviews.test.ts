import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeReviewStats,
  makeReviewToken,
  suggestDisplayName,
  verifyReviewToken,
} from "./reviews";

const RID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

beforeEach(() => {
  process.env.REVIEW_TOKEN_SECRET = "secreto-de-test";
});
afterEach(() => {
  delete process.env.REVIEW_TOKEN_SECRET;
});

describe("token de reseña (firmado por reserva)", () => {
  it("round-trip: firmar y verificar devuelve el reservationId", () => {
    const token = makeReviewToken(RID);
    expect(verifyReviewToken(token)).toBe(RID);
  });

  it("token manipulado (otro id con la firma vieja) → inválido", () => {
    const token = makeReviewToken(RID);
    const otherId = Buffer.from("b9999999-0000-4000-8000-000000000001").toString("base64url");
    const tampered = `${otherId}.${token.split(".")[1]}`;
    expect(verifyReviewToken(tampered)).toBeNull();
  });

  it("firma alterada, formato basura y payload no-uuid → inválidos", () => {
    const token = makeReviewToken(RID);
    expect(verifyReviewToken(token.slice(0, -2) + "xx")).toBeNull();
    expect(verifyReviewToken("nada-que-ver")).toBeNull();
    expect(verifyReviewToken("")).toBeNull();
    const evil = Buffer.from("'; drop table reviews; --").toString("base64url");
    expect(verifyReviewToken(`${evil}.firma`)).toBeNull();
  });

  it("con otro secret la firma no valida (reuso entre entornos)", () => {
    const token = makeReviewToken(RID);
    process.env.REVIEW_TOKEN_SECRET = "otro-secreto";
    expect(verifyReviewToken(token)).toBeNull();
  });
});

describe("computeReviewStats", () => {
  it("promedio general a 1 decimal y por categoría", () => {
    const stats = computeReviewStats([
      { rating_overall: 5, limpieza: 5, veracidad: 4, llegada: 5, comunicacion: 5, ubicacion: 4, calidad_precio: 5 },
      { rating_overall: 4, limpieza: 4, veracidad: 5, llegada: 4, comunicacion: 5, ubicacion: 5, calidad_precio: 4 },
      { rating_overall: 5, limpieza: 5, veracidad: 5, llegada: 5, comunicacion: 4, ubicacion: 5, calidad_precio: 5 },
    ]);
    expect(stats.count).toBe(3);
    expect(stats.avg_overall).toBe(4.7);            // 14/3 = 4.666 → 4.7
    expect(stats.categories.limpieza).toBe(4.7);
    expect(stats.categories.comunicacion).toBe(4.7);
    expect(stats.categories.ubicacion).toBe(4.7);
  });

  it("las reseñas legacy (categorías null) no arrastran el promedio", () => {
    const stats = computeReviewStats([
      { rating_overall: 5, limpieza: null, veracidad: null, llegada: null, comunicacion: null, ubicacion: null, calidad_precio: null },
      { rating_overall: 4, limpieza: 4, veracidad: 4, llegada: 4, comunicacion: 4, ubicacion: 4, calidad_precio: 4 },
    ]);
    expect(stats.avg_overall).toBe(4.5);
    expect(stats.categories.limpieza).toBe(4);      // solo cuenta la que sí tiene dato
  });

  it("sin reseñas: count 0, sin promedios fantasma", () => {
    const stats = computeReviewStats([]);
    expect(stats.count).toBe(0);
    expect(stats.avg_overall).toBe(0);
    expect(stats.categories.limpieza).toBeNull();
  });
});

describe("suggestDisplayName", () => {
  it('estilo Airbnb: "María José Pérez" → "María J."', () => {
    expect(suggestDisplayName("María José Pérez")).toBe("María J.");
    expect(suggestDisplayName("Ana Pérez")).toBe("Ana P.");
    expect(suggestDisplayName("Madonna")).toBe("Madonna");
  });
});
