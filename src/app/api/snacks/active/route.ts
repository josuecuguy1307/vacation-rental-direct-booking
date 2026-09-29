import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getActiveReservationById, getTab } from "@/lib/snack-tab";
import { verifySnackToken } from "@/lib/snack-token";

export const dynamic = "force-dynamic";

/**
 * GET /api/snacks/active — la cuenta (tab) del huésped, para /snacks.
 * Exige el token del link de snacks (header x-snack-token): sin él no se
 * revela nada, ni siquiera si hay alguien hospedado.
 *   sin token / token inválido     → { active:false, reason:"link" }
 *   token válido, reserva no activa → { active:false, reason:"inactive" }
 */
export async function GET(req: NextRequest) {
  const reservationId = verifySnackToken(req.headers.get("x-snack-token"));
  if (!reservationId) return NextResponse.json({ active: false, reason: "link" });

  const db = supabaseAdmin();
  const active = await getActiveReservationById(db, reservationId);
  if (!active) return NextResponse.json({ active: false, reason: "inactive" });
  const tab = await getTab(db, active.id);
  return NextResponse.json({
    active: true,
    guest_first_name: active.guest_name.split(" ")[0] ?? "",
    tab,
  });
}
