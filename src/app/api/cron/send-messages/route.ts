import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { processDueMessages } from "@/lib/messaging/send";
import { checkPendingBalanceLinks } from "@/lib/balance";
import { maybeSendOwnerDigest } from "@/lib/owner-notify";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/send-messages — cada 15 min vía vercel.json.
 * Envía los mensajes del timeline (scheduled_messages) con send_at vencido:
 * email (Resend, branding la propiedad) y WhatsApp Cloud API. Reintentos máx 3
 * por mensaje; al agotar quedan en status='failed' con last_error.
 * Protegido con CRON_SECRET, igual que los otros crons.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const result = await processDueMessages(db, { limit: 50 });
  // links de saldo pendientes: Payphone no notifica solo → se consultan aquí
  const balancesConfirmed = await checkPendingBalanceLinks(db).catch((e) => {
    console.error("[send-messages] balance check:", e);
    return 0;
  });
  // resumen diario de espejos para la dueña (OWNER_DIGEST=daily)
  const digest = await maybeSendOwnerDigest(db).catch(() => false);

  if (result.processed > 0 || balancesConfirmed > 0) {
    console.log(
      `[send-messages] procesados ${result.processed} · enviados ${result.sent} · agotados ${result.failed} · saldos confirmados ${balancesConfirmed}`
    );
  }
  return NextResponse.json({ ...result, balances_confirmed: balancesConfirmed, digest_sent: digest });
}
