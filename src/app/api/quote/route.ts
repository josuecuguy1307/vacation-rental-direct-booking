import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeQuote, nightsBetween, type AddonSelection } from "@/lib/pricing";
import { fetchSeasonsForRange } from "@/lib/seasons";
import { todayInPropertyTz } from "@/lib/dates";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/quote?property=&check_in=&check_out=&adults=&children=&addons=
 * Cotización EN VIVO para la tarjeta de resumen. Mismo cálculo de servidor
 * que usa POST /api/reservations (lib/pricing) — el cliente nunca calcula.
 * No reserva nada: solo precio.
 *
 * Modelo por temporada con split: cada noche cobra el weekday_price_cents
 * (dom-jue) o weekend_price_cents (vie-sáb) de la season que la cubre
 * (mayor priority gana) o del default de la propiedad. Huésped extra
 * (sobre included_guests) paga extra_guest_price_cents por noche; los
 * extras NO varían por temporada ni por día.
 *
 * addons (opcional): JSON urlencoded [{"addon_id":"uuid","quantity":2}, ...]
 * `guests` se acepta como legacy (= adults, children=0).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const checkIn = searchParams.get("check_in") ?? "";
  const checkOut = searchParams.get("check_out") ?? "";
  const slug = searchParams.get("property") ?? SITE.slug;

  const adults = Number(searchParams.get("adults") ?? searchParams.get("guests") ?? 0);
  const children = Number(searchParams.get("children") ?? 0);
  // mascotas: preview en vivo → clamp suave (0..4) en vez de 400
  const pets = Math.max(0, Math.min(4, Math.floor(Number(searchParams.get("pets") ?? 0) || 0)));

  if (!DATE_RE.test(checkIn) || !DATE_RE.test(checkOut) || checkOut <= checkIn) {
    return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 });
  }
  // mismo criterio de "hoy" que POST /api/reservations: si se puede cotizar,
  // se puede reservar (evita que el borde de medianoche UTC los desalinee)
  if (checkIn < todayInPropertyTz()) {
    return NextResponse.json({ error: "check_in no puede ser en el pasado" }, { status: 400 });
  }
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) {
    return NextResponse.json({ error: "adults/children inválidos" }, { status: 400 });
  }

  let selections: AddonSelection[] = [];
  const addonsParam = searchParams.get("addons");
  if (addonsParam) {
    try {
      const parsed = JSON.parse(addonsParam);
      if (!Array.isArray(parsed)) throw new Error();
      selections = parsed.filter(
        (s) => s && typeof s.addon_id === "string" && Number(s.quantity) > 0
      );
    } catch {
      return NextResponse.json({ error: "addons inválido" }, { status: 400 });
    }
  }

  const db = supabaseAdmin();
  const { data: property } = await db
    .from("properties")
    .select(
      "id, weekday_price_cents, weekend_price_cents, extra_guest_price_cents, included_guests, max_guests, min_nights, cleaning_fee, deposit_percentage, pet_price_cents, guarantee_cents"
    )
    .eq("slug", slug)
    .eq("active", true)
    .single();
  if (!property) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  const nights = nightsBetween(checkIn, checkOut);
  if (nights < property.min_nights) {
    return NextResponse.json(
      { error: `Estadía mínima: ${property.min_nights} noches` },
      { status: 400 }
    );
  }
  if (adults + children > property.max_guests) {
    return NextResponse.json(
      { error: `Máximo ${property.max_guests} huéspedes` },
      { status: 400 }
    );
  }

  // filas reales de la DB para los addons pedidos (precio del servidor)
  let addonRows: Array<{ id: string; name: string; price: number; type: "per_stay" | "per_night" | "per_person" }> = [];
  if (selections.length) {
    const { data } = await db
      .from("addons")
      .select("id, name, price, type")
      .eq("property_id", property.id)
      .eq("active", true)
      .in("id", selections.map((s) => s.addon_id));
    addonRows = data ?? [];
  }

  // seasons reales de la DB que tocan el rango de noches [checkIn, checkOut)
  let quote;
  try {
    const seasons = await fetchSeasonsForRange(db, property.id, checkIn, checkOut);
    quote = computeQuote({
      defaultWeekdayCents: Number(property.weekday_price_cents),
      defaultWeekendCents: Number(property.weekend_price_cents),
      extraGuestCents: Number(property.extra_guest_price_cents),
      includedGuests: Number(property.included_guests),
      maxGuests: Number(property.max_guests),
      cleaningFee: Number(property.cleaning_fee),
      depositPercentage: Number(property.deposit_percentage),
      checkIn,
      checkOut,
      adults,
      children,
      petCount: pets,
      petPriceCents: Number(property.pet_price_cents ?? 0),
      guaranteeCents: Number(property.guarantee_cents ?? 0),
      seasons,
      addons: addonRows,
      selections,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const nameById = new Map(addonRows.map((a) => [a.id, a.name]));
  return NextResponse.json({
    ...quote,
    deposit_percentage: Number(property.deposit_percentage),
    addon_lines: quote.addon_lines.map((l) => ({
      ...l,
      name: nameById.get(l.addon_id) ?? "",
    })),
  });
}
