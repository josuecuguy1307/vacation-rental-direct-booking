import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * ¿El request trae `Authorization: Bearer <CRON_SECRET>`?
 * Falla CERRADO: sin CRON_SECRET configurado, nadie pasa (antes, un secreto
 * ausente dejaba los crons abiertos a cualquiera). Vercel Cron manda este
 * header solo, siempre que CRON_SECRET exista en las env vars del proyecto.
 */
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron-auth] CRON_SECRET is not set: request rejected");
    return false;
  }
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return got.length === expected.length && timingSafeEqual(got, expected);
}
