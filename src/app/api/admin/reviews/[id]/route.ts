import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/reviews/[id] — moderación (Etapa 14).
 * Body: { action: "approve" | "reject" }. Solo published sale en la web.
 * (Se acepta { approved: boolean } como legacy.)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  let body: { action?: string; approved?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  let publish: boolean;
  if (body.action === "approve") publish = true;
  else if (body.action === "reject") publish = false;
  else if (typeof body.approved === "boolean") publish = body.approved; // legacy
  else {
    return NextResponse.json(
      { error: 'action debe ser "approve" o "reject"' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin()
    .from("reviews")
    .update({
      status: publish ? "published" : "rejected",
      approved: publish, // columna legacy, mantenida en sincronía
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Review no encontrada" }, { status: 404 });
  return NextResponse.json({ review: data });
}

/** DELETE /api/admin/reviews/[id] */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const { data, error } = await supabaseAdmin()
    .from("reviews")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Review no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
