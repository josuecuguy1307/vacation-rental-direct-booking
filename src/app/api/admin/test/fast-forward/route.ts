import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { processDueMessages } from "@/lib/messaging/send";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/test/fast-forward — utilidad de PRUEBA E2E (Etapa 19-D):
 * adelanta el reloj de los mensajes programados de una reserva (send_at →
 * ahora) y los procesa al instante, para ejercitar el timeline completo
 * hoy mismo sin esperar días.
 * Body: { reservation_id }  ·  Auth: Bearer CRON_SECRET (igual que los crons).
 * Solo existe con ENABLE_TEST_ROUTES=true: en producción responde 404.
 */
export async function POST(req: NextRequest) {
  if (process.env.ENABLE_TEST_ROUTES !== "true") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { reservation_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body.reservation_id) {
    return NextResponse.json({ error: "reservation_id requerido" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: moved, error } = await db
    .from("scheduled_messages")
    .update({ send_at: new Date().toISOString() })
    .eq("reservation_id", body.reservation_id)
    .eq("status", "pending")
    .select("template_key, channel");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = await processDueMessages(db, { reservationId: body.reservation_id, limit: 30 });

  return NextResponse.json({
    ok: true,
    adelantados: (moved ?? []).map((m) => `${m.template_key}/${m.channel}`),
    ...result,
  });
}
