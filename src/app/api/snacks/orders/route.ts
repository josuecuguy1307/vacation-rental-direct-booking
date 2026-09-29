import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { snackOrderSchema } from "@/lib/snacks-orders";
import { firstIssue } from "@/lib/booking-schema";
import { getActiveReservationById, addToTab, getTab } from "@/lib/snack-tab";
import { verifySnackToken } from "@/lib/snack-token";

export const dynamic = "force-dynamic";

/**
 * POST /api/snacks/orders — agrega snacks al TAB de la reserva del link.
 * Exige el token del link de snacks (header x-snack-token) → 401 sin él.
 * El cliente solo manda {addon_id, cantidad}: los precios y el total se
 * recalculan en servidor con la tabla addons (jamás se confía en el cliente).
 * Ya NO cobra con tarjeta: acumula en la cuenta que la dueña liquida al final.
 * Reserva del link no activa hoy → 409.
 */
export async function POST(req: NextRequest) {
  const reservationId = verifySnackToken(req.headers.get("x-snack-token"));
  if (!reservationId) {
    return NextResponse.json(
      { error: "Abre la carta desde el link de snacks que te enviamos" },
      { status: 401 }
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = snackOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const db = supabaseAdmin();
  const active = await getActiveReservationById(db, reservationId);
  if (!active) {
    return NextResponse.json(
      { error: "Tu estadía no está activa en este momento" },
      { status: 409 }
    );
  }

  try {
    await addToTab(db, active.id, parsed.data.items);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const tab = await getTab(db, active.id);
  return NextResponse.json({ ok: true, tab }, { status: 201 });
}
