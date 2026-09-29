import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { escapeHtml } from "./html";
import { makeSnackToken, verifySnackToken } from "./snack-token";
import { makeReviewToken } from "./reviews";
import { makeOwnerActionToken, verifyOwnerActionToken, OWNER_ACTION_TTL_SECONDS } from "./owner-notify";
import { isCronAuthorized } from "./cron-auth";
import { zonedTimeToDate } from "./dates";
import { MissingEnvError, optionalEnv, requireEnv, siteBaseUrl } from "./env";
import { brandedHtml } from "./notifications/email";

const RID = "0b8f5c3e-1d2a-4c6b-9e7f-123456789abc";

beforeEach(() => {
  process.env.INTERNAL_WEBHOOK_SECRET = "test-secret-".padEnd(64, "x");
  process.env.NEXT_PUBLIC_BASE_URL = "https://example.com";
  delete process.env.SNACK_TOKEN_SECRET;
  delete process.env.REVIEW_TOKEN_SECRET;
});

describe("escapeHtml", () => {
  it("neutraliza etiquetas y comillas", () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  });
  it("null/undefined → vacío", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
  it("brandedHtml escapa el texto plano (nombre malicioso del huésped)", () => {
    const html = brandedHtml(`Huésped: <a href="https://evil.test">Confirmar</a>`);
    expect(html).not.toContain(`<a href="https://evil.test">`);
    expect(html).toContain("&lt;a href=&quot;https://evil.test&quot;&gt;");
  });
});

describe("token de snacks", () => {
  it("ida y vuelta", () => {
    expect(verifySnackToken(makeSnackToken(RID))).toBe(RID);
  });
  it("rechaza vacío, basura y firma alterada", () => {
    expect(verifySnackToken(null)).toBeNull();
    expect(verifySnackToken("")).toBeNull();
    expect(verifySnackToken("abc.def")).toBeNull();
    const t = makeSnackToken(RID);
    expect(verifySnackToken(t.slice(0, -2) + "zz")).toBeNull();
  });
  it("un token de RESEÑA de la misma reserva no sirve para snacks", () => {
    expect(verifySnackToken(makeReviewToken(RID))).toBeNull();
  });
  it("sin secreto configurado → null (no lanza)", () => {
    const t = makeSnackToken(RID);
    delete process.env.INTERNAL_WEBHOOK_SECRET;
    expect(verifySnackToken(t)).toBeNull();
  });
});

describe("token de acción de la dueña", () => {
  const now = Date.UTC(2026, 8, 28, 12);
  it("válido dentro de las 72 h", () => {
    const t = makeOwnerActionToken(RID, "confirmar", now);
    expect(verifyOwnerActionToken(t, now + 3600_000)).toEqual({
      reservationId: RID, action: "confirmar", expired: false,
    });
  });
  it("vencido pasadas las 72 h", () => {
    const t = makeOwnerActionToken(RID, "confirmar", now);
    expect(verifyOwnerActionToken(t, now + (OWNER_ACTION_TTL_SECONDS + 1) * 1000)?.expired).toBe(true);
  });
  it("no se puede alargar el vencimiento editando el link", () => {
    const [id, action, exp, sig] = makeOwnerActionToken(RID, "rechazar", now).split(".");
    expect(verifyOwnerActionToken(`${id}.${action}.${Number(exp) + 999999}.${sig}`, now)).toBeNull();
  });
  it("no se puede cambiar rechazar → confirmar", () => {
    const [id, , exp, sig] = makeOwnerActionToken(RID, "rechazar", now).split(".");
    expect(verifyOwnerActionToken(`${id}.confirmar.${exp}.${sig}`, now)).toBeNull();
  });
  it("los tokens viejos (sin vencimiento) ya no valen", () => {
    expect(verifyOwnerActionToken("aWQ.confirmar.firma", now)).toBeNull();
  });
});

describe("isCronAuthorized", () => {
  const req = (auth?: string) =>
    new NextRequest("https://x.test/api/cron/x", auth ? { headers: { authorization: auth } } : {});
  it("falla CERRADO sin CRON_SECRET", () => {
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized(req())).toBe(false);
    expect(isCronAuthorized(req("Bearer undefined"))).toBe(false);
  });
  it("acepta solo el secreto exacto", () => {
    process.env.CRON_SECRET = "s3cr3t";
    expect(isCronAuthorized(req("Bearer s3cr3t"))).toBe(true);
    expect(isCronAuthorized(req("Bearer s3cr3"))).toBe(false);
    expect(isCronAuthorized(req())).toBe(false);
  });
});

describe("zonedTimeToDate (zona horaria de la propiedad)", () => {
  it("UTC-5 fijo (sin horario de verano)", () => {
    expect(zonedTimeToDate("2026-07-09", "15:00", "America/Bogota").toISOString()).toBe("2026-07-09T20:00:00.000Z");
  });
  it("respeta el horario de verano: Nueva York en julio (UTC-4) y en enero (UTC-5)", () => {
    expect(zonedTimeToDate("2026-07-09", "15:00", "America/New_York").toISOString()).toBe("2026-07-09T19:00:00.000Z");
    expect(zonedTimeToDate("2026-01-09", "15:00", "America/New_York").toISOString()).toBe("2026-01-09T20:00:00.000Z");
  });
  it("UTC es la identidad", () => {
    expect(zonedTimeToDate("2026-07-09", "15:00", "UTC").toISOString()).toBe("2026-07-09T15:00:00.000Z");
  });
});

describe("requireEnv / optionalEnv", () => {
  it("throws a clear message when the variable is missing", () => {
    delete process.env.ALGUNA_VAR_INEXISTENTE;
    expect(() => requireEnv("ALGUNA_VAR_INEXISTENTE", "Used for X.")).toThrow(/ALGUNA_VAR_INEXISTENTE[\s\S]*Used for X\.[\s\S]*\.env\.example/);
  });
  it("a TU_..._AQUI placeholder counts as not configured", () => {
    process.env.VAR_PLACEHOLDER = "TU_API_KEY_AQUI";
    expect(() => requireEnv("VAR_PLACEHOLDER")).toThrow(MissingEnvError);
    expect(optionalEnv("VAR_PLACEHOLDER")).toBeUndefined();
  });
  it("devuelve el valor real", () => {
    process.env.VAR_REAL = " valor ";
    expect(requireEnv("VAR_REAL")).toBe("valor");
  });
  it("siteBaseUrl quita la barra final y falla sin la variable", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://example.com/";
    expect(siteBaseUrl()).toBe("https://example.com");
    delete process.env.NEXT_PUBLIC_BASE_URL;
    expect(() => siteBaseUrl()).toThrow(/NEXT_PUBLIC_BASE_URL/);
  });
});
