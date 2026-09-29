import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

/** Valida fecha YYYY-MM-DD real (rechaza 2026-02-30, formatos raros, etc.). */
function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(value + "T00:00:00Z");
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

/** GET /api/admin/seasons?property=slug — temporadas de la propiedad, por fecha de inicio. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const slug = req.nextUrl.searchParams.get("property") ?? SITE.slug;
  const db = supabaseAdmin();
  const { data: property } = await db
    .from("properties")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!property) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  const { data, error } = await db
    .from("seasons")
    .select("*")
    .eq("property_id", property.id)
    .order("date_start");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ seasons: data });
}

/**
 * POST /api/admin/seasons — crea una temporada.
 * Body: { property_slug?, name, date_start, date_end,
 *         weekday_price_cents (noches dom-jue),
 *         weekend_price_cents (noches vie y sáb), priority? }
 * date_end es EXCLUSIVO: la noche que empieza en date_end ya NO es de la temporada
 * (intervalo medio-abierto '[)', igual que las reservas). Los solapamientos entre
 * temporadas son válidos: la noche la gana la de mayor priority.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  let body: {
    property_slug?: string; name?: string; date_start?: string;
    date_end?: string; weekday_price_cents?: number;
    weekend_price_cents?: number; priority?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name requerido" }, { status: 400 });
  }
  if (!body.date_start || !isValidDate(body.date_start) ||
      !body.date_end || !isValidDate(body.date_end)) {
    return NextResponse.json(
      { error: "date_start y date_end deben ser fechas YYYY-MM-DD válidas" },
      { status: 400 }
    );
  }
  if (body.date_end <= body.date_start) {
    return NextResponse.json(
      { error: "date_end debe ser posterior a date_start (date_end es exclusivo)" },
      { status: 400 }
    );
  }
  for (const k of ["weekday_price_cents", "weekend_price_cents"] as const) {
    if (!Number.isInteger(body[k]) || (body[k] as number) <= 0) {
      return NextResponse.json(
        { error: `${k} debe ser un entero > 0 (centavos)` },
        { status: 400 }
      );
    }
  }
  if (body.priority !== undefined && !Number.isInteger(body.priority)) {
    return NextResponse.json({ error: "priority debe ser un entero" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: property } = await db
    .from("properties")
    .select("id")
    .eq("slug", body.property_slug ?? SITE.slug)
    .single();
  if (!property) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  const { data, error } = await db
    .from("seasons")
    .insert({
      property_id: property.id,
      name: body.name.trim(),
      date_start: body.date_start,
      date_end: body.date_end,
      weekday_price_cents: body.weekday_price_cents,
      weekend_price_cents: body.weekend_price_cents,
      priority: body.priority ?? 0,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ season: data }, { status: 201 });
}
