import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/admin/blocks — bloqueo manual de fechas (mantenimiento, uso propio).
 * Body: { property_slug?, start_date, end_date, summary? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  let body: { property_slug?: string; start_date?: string; end_date?: string; summary?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (
    !body.start_date || !DATE_RE.test(body.start_date) ||
    !body.end_date || !DATE_RE.test(body.end_date) ||
    body.end_date <= body.start_date
  ) {
    return NextResponse.json(
      { error: "start_date y end_date requeridos (YYYY-MM-DD, end > start)" },
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
    .from("ical_blocks")
    .insert({
      property_id: property.id,
      source: "manual",
      start_date: body.start_date,
      end_date: body.end_date,
      uid: `manual-${crypto.randomUUID()}`,
      summary: body.summary ?? "Bloqueo manual",
    })
    .select("id, start_date, end_date, summary")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ block: data }, { status: 201 });
}

/** GET /api/admin/blocks — lista todos los bloqueos (manuales + importados). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const { data, error } = await supabaseAdmin()
    .from("ical_blocks")
    .select("id, source, start_date, end_date, summary, created_at")
    .order("start_date");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ blocks: data });
}

/** DELETE /api/admin/blocks?id=<uuid> — elimina un bloqueo manual. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("ical_blocks")
    .delete()
    .eq("id", id)
    .eq("source", "manual") // los importados los gestiona el cron
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: "Bloqueo no encontrado o no es manual" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
