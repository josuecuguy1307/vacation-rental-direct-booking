import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ADDON_TYPES = ["per_stay", "per_night", "per_person"];
const UPDATABLE = ["name", "description", "price", "type", "image_url", "active"] as const;

/** PATCH /api/admin/addons/[id] — actualiza campos del addon. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const key of UPDATABLE) {
    if (key in body) updates[key] = body[key];
  }
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }
  if (updates.type && !ADDON_TYPES.includes(updates.type as string)) {
    return NextResponse.json(
      { error: `type debe ser uno de: ${ADDON_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  if ("price" in updates && (typeof updates.price !== "number" || updates.price < 0)) {
    return NextResponse.json({ error: "price inválido" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("addons")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Addon no encontrado" }, { status: 404 });
  return NextResponse.json({ addon: data });
}

/**
 * DELETE /api/admin/addons/[id] — desactiva (soft delete) para no romper
 * reservation_addons históricos. Borra de verdad solo si nunca se usó.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const db = supabaseAdmin();

  const { count } = await db
    .from("reservation_addons")
    .select("id", { count: "exact", head: true })
    .eq("addon_id", id);

  if (count && count > 0) {
    const { error } = await db.from("addons").update({ active: false }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, soft_deleted: true });
  }

  const { error } = await db.from("addons").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, soft_deleted: false });
}
