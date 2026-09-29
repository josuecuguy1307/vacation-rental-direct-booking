import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { logAudit } from "@/lib/panel";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

/**
 * Defaults de precio de la propiedad (Etapa 8.5): lo que cobra una noche
 * cuando NINGUNA season la cubre ("temporada media").
 *   weekday_price_cents → noches de domingo a jueves
 *   weekend_price_cents → noches de viernes y sábado
 */

/** GET /api/admin/property?property=slug — configuración de precios actual. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const slug = req.nextUrl.searchParams.get("property") ?? SITE.slug;
  const { data, error } = await supabaseAdmin()
    .from("properties")
    .select(
      "id, slug, weekday_price_cents, weekend_price_cents, extra_guest_price_cents, pet_price_cents, included_guests, max_guests, min_nights, cleaning_fee, deposit_percentage, wifi_name, wifi_password, check_in_time, check_out_time"
    )
    .eq("slug", slug)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ property: data });
}

/* Validadores por campo editable desde el panel (módulo F). */
const VALIDATORS: Record<string, (v: unknown) => string | null> = {
  weekday_price_cents: intMin(1, "centavos"),
  weekend_price_cents: intMin(1, "centavos"),
  extra_guest_price_cents: intMin(0, "centavos"),
  pet_price_cents: intMin(0, "centavos"),
  included_guests: intMin(1),
  max_guests: intMin(1),
  min_nights: intMin(1),
  cleaning_fee: numMin(0, "dólares"),
  deposit_percentage: (v) =>
    typeof v === "number" && v >= 10 && v <= 100 ? null : "debe ser un número entre 10 y 100",
  wifi_name: str(80),
  wifi_password: str(80),
  check_in_time: time(),
  check_out_time: time(),
};

function intMin(min: number, unidad?: string) {
  return (v: unknown) =>
    Number.isInteger(v) && (v as number) >= min
      ? null
      : `debe ser un entero ≥ ${min}${unidad ? ` (${unidad})` : ""}`;
}
function numMin(min: number, unidad?: string) {
  return (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= min
      ? null
      : `debe ser un número ≥ ${min}${unidad ? ` (${unidad})` : ""}`;
}
function str(max: number) {
  return (v: unknown) =>
    typeof v === "string" && v.trim().length > 0 && v.length <= max
      ? null
      : `debe ser texto (máx ${max} caracteres)`;
}
function time() {
  return (v: unknown) =>
    typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v)
      ? null
      : "debe ser una hora HH:MM";
}

/**
 * PATCH /api/admin/property?property=slug
 * Acepta cualquier subconjunto de los campos validados arriba (módulo F:
 * wifi, horarios, limpieza, % de anticipo; y precios base del módulo G).
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const slug = req.nextUrl.searchParams.get("property") ?? SITE.slug;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [key, validate] of Object.entries(VALIDATORS)) {
    if (key in body) {
      const err = validate(body[key]);
      if (err) return NextResponse.json({ error: `${key} ${err}` }, { status: 400 });
      updates[key] = body[key];
    }
  }
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }
  if (
    "included_guests" in updates && "max_guests" in updates &&
    (updates.included_guests as number) > (updates.max_guests as number)
  ) {
    return NextResponse.json(
      { error: "included_guests no puede superar max_guests" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("properties")
    .update(updates)
    .eq("slug", slug)
    .select(
      "slug, weekday_price_cents, weekend_price_cents, extra_guest_price_cents, pet_price_cents, included_guests, max_guests, min_nights, cleaning_fee, deposit_percentage, wifi_name, wifi_password, check_in_time, check_out_time"
    )
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });

  logAudit(db, {
    actor: auth.user.email ?? "panel", action: "editar_propiedad",
    entity: "property", entityId: slug, detail: updates,
  }).catch(() => {});

  return NextResponse.json({ property: data });
}
