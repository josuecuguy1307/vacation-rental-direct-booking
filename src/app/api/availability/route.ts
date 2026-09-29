import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { baseForNight } from "@/lib/pricing";
import { fetchSeasonsForRange } from "@/lib/seasons";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Tope del rango consultable: el frontend pide 18 meses; sin tope, un rango
// de siglos expande millones de noches (memoria + JSON gigante) sin auth.
const MAX_RANGE_NIGHTS = 731;

/**
 * GET /api/availability?property=mi-casa&from=2026-06-01&to=2026-08-31
 * → rangos ocupados (reservas pending/confirmed + ical_blocks) para pintar
 *   el calendario. Devuelve también la lista expandida de noches ocupadas
 *   y "nightly_prices": precio base por noche en dólares (season de mayor
 *   priority o default de la propiedad) para cada fecha from <= d < to,
 *   sin extras por huésped — estilo calendario de aerolínea.
 * No expone datos del huésped: solo fechas y precios.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const propertySlug = searchParams.get("property") ?? SITE.slug;

  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || to <= from) {
    return NextResponse.json(
      { error: "Parámetros inválidos: from y to (YYYY-MM-DD, to > from)" },
      { status: 400 }
    );
  }
  const spanNights = Math.round(
    (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000
  );
  if (!Number.isFinite(spanNights) || spanNights > MAX_RANGE_NIGHTS) {
    return NextResponse.json(
      { error: `Rango demasiado amplio: máximo ${MAX_RANGE_NIGHTS} noches` },
      { status: 400 }
    );
  }

  const db = supabaseAdmin(); // necesita ver reservas (RLS las oculta al anon)

  const { data: property } = await db
    .from("properties")
    .select("id, min_nights, max_guests, weekday_price_cents, weekend_price_cents")
    .eq("slug", propertySlug)
    .single();
  if (!property) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  const [{ data: reservations }, { data: blocks }, seasons] = await Promise.all([
    db.from("reservations")
      .select("check_in, check_out")
      .eq("property_id", property.id)
      .in("status", ["pending", "confirmed"])
      .lt("check_in", to)
      .gt("check_out", from),
    db.from("ical_blocks")
      .select("start_date, end_date")
      .eq("property_id", property.id)
      .lt("start_date", to)
      .gt("end_date", from),
    fetchSeasonsForRange(db, property.id, from, to),
  ]);

  const ranges = [
    ...(reservations ?? []).map((r) => ({ start: r.check_in, end: r.check_out })),
    ...(blocks ?? []).map((b) => ({ start: b.start_date, end: b.end_date })),
  ];

  // Expandir a noches individuales (end exclusivo, '[)')
  const occupied = new Set<string>();
  for (const r of ranges) {
    const end = Date.parse(r.end + "T00:00:00Z");
    for (let t = Date.parse(r.start + "T00:00:00Z"); t < end; t += 86_400_000) {
      occupied.add(new Date(t).toISOString().slice(0, 10));
    }
  }

  // Precio base por noche (en dólares) para cada fecha from <= d < to
  const nightly_prices: Record<string, number> = {};
  const toMs = Date.parse(to + "T00:00:00Z");
  for (let t = Date.parse(from + "T00:00:00Z"); t < toMs; t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const { cents } = baseForNight(date, seasons, {
      weekdayCents: Number(property.weekday_price_cents),
      weekendCents: Number(property.weekend_price_cents),
    });
    nightly_prices[date] = cents / 100;
  }

  return NextResponse.json({
    property: propertySlug,
    min_nights: property.min_nights,
    max_guests: property.max_guests,
    from,
    to,
    occupied_ranges: ranges,
    occupied_dates: [...occupied].filter((d) => d >= from && d < to).sort(),
    nightly_prices,
  });
}
