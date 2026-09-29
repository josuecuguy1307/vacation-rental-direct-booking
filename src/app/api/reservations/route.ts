import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeQuote, nightsBetween, type AddonSelection } from "@/lib/pricing";
import { fetchSeasonsForRange } from "@/lib/seasons";
import { getPaymentProvider } from "@/lib/payments";
import { todayInPropertyTz } from "@/lib/dates";
import { notifyOwnerWhatsApp } from "@/lib/notifications/whatsapp";
import { firstIssue, reservationBodySchema } from "@/lib/booking-schema";
import { notifyOwnerEvent } from "@/lib/owner-notify";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

/**
 * POST /api/reservations — crea reserva PENDING.
 * - Body validado con zod (src/lib/booking-schema.ts): titular completo
 *   (nombres, documento, país, teléfono), llegada estimada, mascotas,
 *   mensaje y nombres de acompañantes — formulario estilo Airbnb.
 * - TODO el precio se recalcula en servidor (el cliente solo manda ids + qty).
 * - El exclusion constraint de la DB es la fuente de verdad anti doble-reserva:
 *   si dos requests compiten, uno recibe 23P01 → 409.
 * - Los bloqueos iCal (Airbnb/Booking) se chequean en app antes de insertar.
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = reservationBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }
  const body = parsed.data;
  const { adults, children } = body;
  const guestName = `${body.first_name} ${body.last_name}`;

  const checkIn = body.check_in;
  const checkOut = body.check_out;
  // "hoy" en la TZ de la propiedad: con UTC, al caer la tarde en zonas al oeste de UTC una
  // reserva same-day válida se rechazaría como pasada
  const today = todayInPropertyTz();
  if (checkIn < today) {
    return NextResponse.json({ error: "check_in no puede ser en el pasado" }, { status: 400 });
  }
  if (checkOut <= checkIn) {
    return NextResponse.json({ error: "check_out debe ser posterior a check_in" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // ── Propiedad ──────────────────────────────────────────
  const slug = body.property_slug ?? SITE.slug;
  const { data: property } = await db
    .from("properties")
    .select(
      "id, name, weekday_price_cents, weekend_price_cents, extra_guest_price_cents, included_guests, max_guests, min_nights, cleaning_fee, deposit_percentage, pet_price_cents, guarantee_cents"
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
  // enforce de capacidad SIEMPRE en servidor
  if (adults + children > property.max_guests) {
    return NextResponse.json(
      { error: `Máximo ${property.max_guests} huéspedes` },
      { status: 400 }
    );
  }

  // ── Bloqueos iCal (Airbnb/Booking) — no los cubre el constraint ──
  const { data: blocked } = await db
    .from("ical_blocks")
    .select("id")
    .eq("property_id", property.id)
    .lt("start_date", checkOut)
    .gt("end_date", checkIn)
    .limit(1);
  if (blocked && blocked.length > 0) {
    return NextResponse.json({ error: "Fechas no disponibles" }, { status: 409 });
  }

  // ── Recalcular precio en servidor ──────────────────────
  const selections: AddonSelection[] = body.addons;
  let addonRows: { id: string; name: string; price: number; type: "per_stay" | "per_night" | "per_person" }[] = [];
  if (selections.length) {
    const { data } = await db
      .from("addons")
      .select("id, name, price, type")
      .eq("property_id", property.id)
      .eq("active", true)
      .in("id", selections.map((s) => s.addon_id));
    addonRows = data ?? [];
  }

  let quote;
  try {
    // seasons reales de la DB que tocan el rango de noches [checkIn, checkOut)
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
      petCount: body.pet_count,
      petPriceCents: Number(property.pet_price_cents ?? 0),
      guaranteeCents: Number(property.guarantee_cents ?? 0),
      seasons,
      addons: addonRows,
      selections,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  // ── Insertar (el constraint resuelve la carrera) ───────
  const provider = getPaymentProvider();
  const { data: reservation, error: insertErr } = await db
    .from("reservations")
    .insert({
      property_id: property.id,
      guest_name: guestName,
      guest_email: body.email.toLowerCase(),
      guest_phone: body.phone,
      check_in: checkIn,
      check_out: checkOut,
      num_guests: adults + children,
      status: "pending",
      // formulario completo del titular (Etapa 12)
      guest_document_type: body.document_type,
      guest_document: body.document,
      guest_country: body.country,
      arrival_time: body.arrival_time,
      pet_count: body.pet_count,
      guest_message: body.message || null,
      companions: body.companions.length ? body.companions : null,
      // desglose auditable del modelo por temporada (noche a noche)
      adults,
      children,
      price_breakdown: quote.nightly,
      nights: quote.nights,
      subtotal: quote.lodging_total,
      extras_total: quote.extras_total,
      cleaning_fee: quote.cleaning_fee,
      total: quote.total,
      deposit_amount: quote.deposit_amount,
      // saldo = total − anticipo (0 si el anticipo es 100% — Etapa 19)
      balance_due_cents: Math.round(quote.total * 100) - Math.round(quote.deposit_amount * 100),
      // garantía reembolsable: se cobra con la reserva; el reembolso lo dispara
      // la dueña desde el panel al finalizar la estadía (lib/garantia)
      garantia_amount_cents: Math.round(quote.guarantee * 100),
      garantia_estado: quote.guarantee > 0 ? "pendiente" : null,
      payment_method: provider.name,
      payment_status: "unpaid",
    })
    .select("id")
    .single();

  if (insertErr) {
    // 23P01 = exclusion_violation → otra reserva activa solapa estas fechas
    if (insertErr.code === "23P01") {
      return NextResponse.json({ error: "Fechas no disponibles" }, { status: 409 });
    }
    console.error("[reservations] insert error:", insertErr);
    return NextResponse.json({ error: "Error al crear la reserva" }, { status: 500 });
  }

  // ── Addons de la reserva ───────────────────────────────
  if (quote.addon_lines.length) {
    const { error: addonsErr } = await db.from("reservation_addons").insert(
      quote.addon_lines.map((l) => ({
        reservation_id: reservation.id,
        addon_id: l.addon_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
      }))
    );
    if (addonsErr) console.error("[reservations] addons insert error:", addonsErr);
  }

  // ── Avisos a la dueña: entró una reserva nueva (no bloquea) ──
  notifyOwnerEvent({
    titulo: `Nueva reserva ${SITE.bookingCodePrefix}-${reservation.id.slice(0, 8).toUpperCase()} (pendiente de pago)`,
    emoji: "🆕",
    tipo: "reserva_nueva",
    lineas: [
      `Huésped: ${guestName} (${body.email}${body.phone ? ` · ${body.phone}` : ""})`,
      `Fechas: ${checkIn} → ${checkOut} · ${adults + children} huésped(es)`,
      `Total: $${quote.total.toFixed(2)} · a pagar para confirmar: $${quote.deposit_amount.toFixed(2)}`,
      ...(body.arrival_time ? [`Llegada estimada: ${body.arrival_time}`] : []),
      ...(body.pet_count ? [`Mascotas: ${body.pet_count}`] : []),
      ...(body.message ? [`Mensaje: "${body.message}"`] : []),
    ],
  }).catch(() => {});
  const addonNameById = new Map(addonRows.map((a) => [a.id, a.name]));
  notifyOwnerWhatsApp({
    id: reservation.id,
    guest_name: guestName,
    guest_email: body.email,
    guest_phone: body.phone,
    check_in: checkIn,
    check_out: checkOut,
    num_guests: adults + children,
    total: quote.total,
    deposit_amount: quote.deposit_amount,
    status: "pending",
    arrival_time: body.arrival_time,
    pet_count: body.pet_count,
    guest_message: body.message || null,
    companions: body.companions,
    snacks: quote.addon_lines.map((l) => ({
      name: addonNameById.get(l.addon_id) ?? "addon",
      quantity: l.quantity,
    })),
  }).catch(() => {});

  // ── Instrucciones de pago del provider activo ──────────
  const payment = await provider.createPayment({
    reservationId: reservation.id,
    amount: quote.deposit_amount,
    currency: "USD",
    guestName,
    guestEmail: body.email,
    description: `Anticipo reserva ${property.name} ${checkIn} → ${checkOut}`,
  });

  return NextResponse.json(
    {
      reservation: {
        id: reservation.id,
        status: "pending",
        check_in: checkIn,
        check_out: checkOut,
        nights,
        adults,
        children,
        num_guests: adults + children,
        guests: quote.guests,
        extra_guests: quote.extra_guests,
        extra_guest_fee: quote.extra_guest_fee,
        base_lodging_total: quote.base_lodging_total,
        extra_guests_total: quote.extra_guests_total,
        lodging_total: quote.lodging_total,
        extras_total: quote.extras_total,
        pets: quote.pets,
        pets_total: quote.pets_total,
        cleaning_fee: quote.cleaning_fee,
        guarantee: quote.guarantee,
        total: quote.total,
        deposit_amount: quote.deposit_amount,
      },
      payment,
    },
    { status: 201 }
  );
}
