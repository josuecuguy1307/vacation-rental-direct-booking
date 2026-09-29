import { createHmac, timingSafeEqual } from "crypto";
import { siteBaseUrl } from "@/lib/env";

/* ============================================================
   Link de snacks por reserva.

   Antes, /api/snacks/* operaba sobre "la reserva activa de hoy" sin
   pedir nada: cualquiera en internet podía ver el nombre del huésped
   y cargarle consumos a su cuenta. Ahora el huésped recibe su link
   (/snacks?t=<token>) en el mensaje "antes de la llegada" y el token
   dice DE QUÉ reserva es. El servidor además exige que esa reserva
   esté activa hoy, así que un link viejo no sirve para otra estadía.

   Mismo esquema stateless que el token de reseñas, pero con dominio
   propio ("snacks:") para que un token de reseña no valga aquí.
   ============================================================ */

const DOMAIN = "snacks:";

function secret(): string {
  const s = process.env.SNACK_TOKEN_SECRET ?? process.env.INTERNAL_WEBHOOK_SECRET;
  if (!s) throw new Error("SNACK_TOKEN_SECRET / INTERNAL_WEBHOOK_SECRET is not set (see .env.example)");
  return s;
}

const sign = (reservationId: string) =>
  createHmac("sha256", secret()).update(DOMAIN + reservationId).digest("base64url");

export function makeSnackToken(reservationId: string): string {
  return `${Buffer.from(reservationId, "utf8").toString("base64url")}.${sign(reservationId)}`;
}

/** reservationId si el token es válido; null si no. */
export function verifySnackToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  let reservationId: string;
  try {
    reservationId = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(reservationId)) return null;
  let expected: Buffer;
  try {
    expected = Buffer.from(sign(reservationId));
  } catch {
    return null;
  }
  const got = Buffer.from(token.slice(dot + 1));
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  return reservationId;
}

export function snackLinkFor(reservationId: string): string {
  const base = siteBaseUrl();
  return `${base}/snacks?t=${makeSnackToken(reservationId)}`;
}
