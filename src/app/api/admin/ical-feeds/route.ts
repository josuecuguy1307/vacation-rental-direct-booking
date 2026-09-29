import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

/** GET /api/admin/ical-feeds — feeds registrados y su último sync. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const { data, error } = await supabaseAdmin()
    .from("ical_feeds")
    .select("*")
    .order("source");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feeds: data });
}

/**
 * POST /api/admin/ical-feeds — registra/actualiza el feed de una OTA.
 * Body: { property_slug?, source: "airbnb"|"booking", url, active? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  let body: { property_slug?: string; source?: string; url?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body.source?.trim() || !body.url?.startsWith("http")) {
    return NextResponse.json({ error: "source y url (http/https) requeridos" }, { status: 400 });
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
    .from("ical_feeds")
    .upsert(
      {
        property_id: property.id,
        source: body.source.trim().toLowerCase(),
        url: body.url,
        active: body.active ?? true,
      },
      { onConflict: "property_id,source" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feed: data }, { status: 201 });
}
