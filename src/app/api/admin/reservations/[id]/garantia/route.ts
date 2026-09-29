import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { refundGuarantee, type GuaranteeMethod } from "@/lib/garantia";
import { logAudit } from "@/lib/panel";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/reservations/[id]/garantia
 * Body: { action: "refund", metodo?: "tarjeta" | "transferencia" }
 * Dispara el reembolso de la garantía reusando el gancho de Lane 2
 * (lib/garantia.refundGuarantee): transición atómica pendiente → reembolsada,
 * comprobante al huésped + aviso a la dueña. Idempotente (dos clics no
 * duplican). NO es un sistema de reembolso paralelo.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;
  const actor = auth.user.email ?? "panel";

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  let body: { action?: string; metodo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (body.action !== "refund") {
    return NextResponse.json({ error: 'action debe ser "refund"' }, { status: 400 });
  }
  const metodo: GuaranteeMethod | undefined =
    body.metodo === "tarjeta" || body.metodo === "transferencia" ? body.metodo : undefined;

  const db = supabaseAdmin();
  const result = await refundGuarantee(db, id, { metodo, refundedBy: actor });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  logAudit(db, {
    actor,
    action: "reembolsar_garantia",
    entity: "reservation",
    entityId: id,
    detail: { metodo: metodo ?? null, already: result.already ?? false },
  }).catch(() => {});

  return NextResponse.json({ ok: true, already: result.already ?? false });
}
