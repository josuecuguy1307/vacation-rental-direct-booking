import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

/* ============================================================
   Reseñas estilo Airbnb (Etapa 14).

   Solo quien se hospedó puede reseñar: el link del mensaje
   "después de la salida" lleva un TOKEN firmado por reserva
   (HMAC, stateless — sin columnas extra). De un solo uso en la
   práctica: reviews.reservation_id es UNIQUE, así que una
   segunda entrega del formulario recibe "ya dejaste tu
   evaluación".
   ============================================================ */

const b64url = (b: Buffer) => b.toString("base64url");

function secret(): string {
  const s = process.env.REVIEW_TOKEN_SECRET ?? process.env.INTERNAL_WEBHOOK_SECRET;
  if (!s) throw new Error("REVIEW_TOKEN_SECRET / INTERNAL_WEBHOOK_SECRET is not set (see .env.example)");
  return s;
}

const sign = (payload: string) =>
  b64url(createHmac("sha256", secret()).update(payload).digest());

/** Token de reseña: base64url(reservationId) + "." + HMAC. */
export function makeReviewToken(reservationId: string): string {
  const id = b64url(Buffer.from(reservationId, "utf8"));
  return `${id}.${sign(reservationId)}`;
}

/** Devuelve el reservationId si el token es válido; null si no. */
export function verifyReviewToken(token: string): string | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  let reservationId: string;
  try {
    reservationId = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
  } catch {
    return null;
  }
  // los ids son uuids: corta cualquier payload raro antes de firmar
  if (!/^[0-9a-f-]{36}$/i.test(reservationId)) return null;
  const expected = Buffer.from(sign(reservationId));
  const got = Buffer.from(token.slice(dot + 1));
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  return reservationId;
}

/* ── Categorías (mismo orden que el formulario y las barras) ── */
export const CATEGORIES = [
  { key: "limpieza", label: "Limpieza" },
  { key: "veracidad", label: "Veracidad" },
  { key: "llegada", label: "Llegada" },
  { key: "comunicacion", label: "Comunicación" },
  { key: "ubicacion", label: "Ubicación" },
  { key: "calidad_precio", label: "Calidad-precio" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

const stars = z.number().int().min(1, "Califica con 1 a 5 estrellas").max(5);

/** Body de POST /api/reviews (validación que MANDA: la del servidor). */
export const reviewSchema = z.object({
  token: z.string().min(20, "Token inválido"),
  display_name: z.string().trim().min(2, "Escribe tu nombre").max(60),
  rating_overall: stars,
  limpieza: stars,
  veracidad: stars,
  llegada: stars,
  comunicacion: stars,
  ubicacion: stars,
  calidad_precio: stars,
  comment: z
    .string()
    .trim()
    .min(20, "Cuéntanos un poco más (mínimo 20 caracteres)")
    .max(2000, "Máximo 2000 caracteres"),
});

export type ReviewBody = z.infer<typeof reviewSchema>;

/* ── Promedios para la sección del home ─────────────────────── */
export type PublishedReview = {
  rating_overall: number;
  limpieza?: number | null;
  veracidad?: number | null;
  llegada?: number | null;
  comunicacion?: number | null;
  ubicacion?: number | null;
  calidad_precio?: number | null;
};

export type ReviewStats = {
  count: number;
  avg_overall: number;                          // 1 decimal (4.9)
  categories: Record<CategoryKey, number | null>; // null = sin datos
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Promedios; las categorías null (reseñas legacy) no cuentan. */
export function computeReviewStats(rows: PublishedReview[]): ReviewStats {
  const categories = {} as ReviewStats["categories"];
  for (const { key } of CATEGORIES) {
    const vals = rows
      .map((r) => r[key])
      .filter((v): v is number => typeof v === "number");
    categories[key] = vals.length ? round1(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  }
  return {
    count: rows.length,
    avg_overall: rows.length
      ? round1(rows.reduce((s, r) => s + r.rating_overall, 0) / rows.length)
      : 0,
    categories,
  };
}

/** "María José Pérez" → "María J." (estilo Airbnb, editable por el huésped). */
export function suggestDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}
