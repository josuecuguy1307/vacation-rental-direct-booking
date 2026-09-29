import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "published", "rejected"];

/**
 * GET /api/admin/reviews?status=pending — moderación (Etapa 14).
 * Default: pendientes. ?status=all lista todas.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  let query = supabaseAdmin()
    .from("reviews")
    .select("*")
    .order("created_at", { ascending: false });
  if (status !== "all") {
    if (!STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status debe ser uno de: ${STATUSES.join(", ")}, all` },
        { status: 400 }
      );
    }
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reviews: data });
}
