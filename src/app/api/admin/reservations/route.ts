import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reservations?status=&payment_status=&from=&to=&q=&limit=
 * Lista reservas con sus addons (módulo B del panel). `q` busca por nombre,
 * email o por los primeros caracteres del código CB-XXXXXXXX.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const paymentStatus = searchParams.get("payment_status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const q = searchParams.get("q")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

  let query = supabaseAdmin()
    .from("reservations")
    .select("*, reservation_addons(quantity, unit_price, addons(name, type)), properties(slug, name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (paymentStatus) query = query.eq("payment_status", paymentStatus);
  if (from) query = query.gte("check_in", from);
  if (to) query = query.lte("check_in", to);
  if (q) {
    const esc = q.replace(/[%_,()]/g, "");
    query = query.or(`guest_name.ilike.%${esc}%,guest_email.ilike.%${esc}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reservations: data });
}
