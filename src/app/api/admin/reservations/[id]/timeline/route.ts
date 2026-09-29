import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/reservations/[id]/timeline
 * Solo lectura: los mensajes programados de la reserva (scheduled_messages),
 * para poblar el timeline visual del hospedaje. Colapsa email+whatsapp por
 * template_key (preferimos el canal email como representativo) y devuelve
 * el estado y las fechas reales — NO inventa datos.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("scheduled_messages")
    .select("template_key, channel, send_at, sent_at, status")
    .eq("reservation_id", id)
    .order("send_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Item = { template_key: string; status: string; send_at: string; sent_at: string | null };
  const byKey = new Map<string, Item>();
  for (const m of data ?? []) {
    // un ítem por template_key; el canal email es el representativo (el que
    // la dueña ve de fijo). Como viene ordenado por send_at, el email pisa al
    // whatsapp cuando existe.
    if (!byKey.has(m.template_key) || m.channel === "email") {
      byKey.set(m.template_key, {
        template_key: m.template_key,
        status: m.status,
        send_at: m.send_at,
        sent_at: m.sent_at,
      });
    }
  }

  return NextResponse.json({ items: [...byKey.values()] });
}
