import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

const ADDON_TYPES = ["per_stay", "per_night", "per_person"];

/** GET /api/admin/addons — todos los addons (activos e inactivos). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const { data, error } = await supabaseAdmin()
    .from("addons")
    .select("*")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ addons: data });
}

/**
 * POST /api/admin/addons — crea un addon.
 * Body: { property_slug?, name, description?, price, type, image_url?, active? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  let body: {
    property_slug?: string; name?: string; description?: string;
    price?: number; type?: string; image_url?: string; active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.name?.trim() || typeof body.price !== "number" || body.price < 0) {
    return NextResponse.json({ error: "name y price (>= 0) requeridos" }, { status: 400 });
  }
  if (body.type && !ADDON_TYPES.includes(body.type)) {
    return NextResponse.json(
      { error: `type debe ser uno de: ${ADDON_TYPES.join(", ")}` },
      { status: 400 }
    );
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
    .from("addons")
    .insert({
      property_id: property.id,
      name: body.name.trim(),
      description: body.description ?? null,
      price: body.price,
      type: body.type ?? "per_stay",
      image_url: body.image_url ?? null,
      active: body.active ?? true,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ addon: data }, { status: 201 });
}
