import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getTab, getSettledTotal, settleTab } from "@/lib/snack-tab";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/admin/reservations/[id]/snacks — tab pendiente + total ya liquidado. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const db = supabaseAdmin();
  const [tab, settled_cents] = await Promise.all([getTab(db, id), getSettledTotal(db, id)]);
  return NextResponse.json({ tab, settled_cents });
}

/**
 * POST /api/admin/reservations/[id]/snacks
 * { action:'mark_paid', method:'transfer'|'cash' } — la dueña liquida el tab.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  let body: { action?: string; method?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (body.action !== "mark_paid") {
    return NextResponse.json({ error: "action inválida" }, { status: 400 });
  }
  const method = body.method === "cash" ? "cash" : body.method === "transfer" ? "transfer" : null;
  if (!method) {
    return NextResponse.json({ error: "method debe ser 'transfer' o 'cash'" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const by = (auth as { email?: string }).email ?? "admin";
  try {
    const res = await settleTab(db, id, method, by);
    if (res.count === 0) return NextResponse.json({ ok: true, already: true, total_cents: 0 });
    return NextResponse.json({ ok: true, count: res.count, total_cents: res.total_cents });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
