import { z } from "zod";
import { SITE } from "@/config/site.config";

/* ============================================================
   Schema del formulario de reserva (Etapa 12) — compartido por
   el cliente (validación en vivo) y POST /api/reservations
   (la validación que MANDA es siempre la del servidor).
   ============================================================ */

export const DOC_TYPES = ["cedula", "pasaporte"] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** Franjas de llegada (se guardan tal cual en reservations.arrival_time). */
export const ARRIVAL_TIMES = [
  "15h00 a 16h00",
  "16h00 a 18h00",
  "18h00 a 20h00",
  "20h00 a 22h00",
  "Después de las 22h00",
  "Aún no lo sé",
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Campos del titular y su grupo (sin reglas cruzadas). */
const guestBase = z.object({
  first_name: z.string().trim().min(2, "Escribe tus nombres").max(60),
  last_name: z.string().trim().min(2, "Escribe tus apellidos").max(60),
  document_type: z.enum(DOC_TYPES, { message: "Elige cédula o pasaporte" }),
  document: z
    .string()
    .trim()
    .min(5, "Documento muy corto")
    .max(20, "Documento muy largo")
    .regex(/^[A-Za-z0-9.-]+$/, "Documento inválido (solo letras y números)"),
  email: z.string().trim().email("Escribe un correo válido"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s-]{7,20}$/, `Escribe un teléfono válido (ej. ${SITE.phonePlaceholder})`),
  country: z.string().trim().min(2, "Cuéntanos de qué país vienes").max(56),
  arrival_time: z.enum(ARRIVAL_TIMES, { message: "Elige tu hora estimada de llegada" }),
  pet_count: z.number().int().min(0).max(4, "Máximo 4 mascotas"),
  message: z.string().trim().max(500, "Máximo 500 caracteres").default(""),
  companions: z
    .array(z.string().trim().min(2, "Nombre de acompañante muy corto").max(80))
    .max(7)
    .default([]),
});

/** cédula ecuatoriana: 10 dígitos exactos; pasaporte queda alfanumérico */
const cedulaCheck = (
  v: { document_type: DocType; document: string },
  ctx: z.RefinementCtx
) => {
  if (v.document_type === "cedula" && !/^\d{10}$/.test(v.document)) {
    ctx.addIssue({
      code: "custom",
      path: ["document"],
      message: "La cédula debe tener 10 dígitos",
    });
  }
};

export const guestDetailsSchema = guestBase.superRefine(cedulaCheck);
export type GuestDetails = z.infer<typeof guestDetailsSchema>;

/** Body completo de POST /api/reservations (formulario nuevo). */
export const reservationBodySchema = guestBase
  .extend({
    property_slug: z.string().trim().default(SITE.slug),
    check_in: z.string().regex(DATE_RE, "check_in inválido (YYYY-MM-DD)"),
    check_out: z.string().regex(DATE_RE, "check_out inválido (YYYY-MM-DD)"),
    adults: z.number().int().min(1, "Se requiere al menos 1 adulto").max(8),
    children: z.number().int().min(0).max(7),
    // addons (cajita legacy / extras futuros): el precio sale SIEMPRE de la DB
    addons: z
      .array(z.object({ addon_id: z.string(), quantity: z.number().positive() }))
      .default([]),
  })
  .superRefine((v, ctx) => {
    cedulaCheck(v, ctx);
    // los acompañantes son los huéspedes además del titular
    if (v.companions.length > v.adults + v.children - 1) {
      ctx.addIssue({
        code: "custom",
        path: ["companions"],
        message: "Hay más nombres de acompañantes que huéspedes",
      });
    }
  });

export type ReservationBody = z.infer<typeof reservationBodySchema>;

/** Primer error legible de un safeParse fallido (para toast / respuesta 400). */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? issue.message : "Datos inválidos";
}
