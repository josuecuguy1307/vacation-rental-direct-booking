import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/expire-pending — cancela reservas pending sin pago que
 * superaron la ventana de expiración (RESERVATION_EXPIRY_HOURS, default 24).
 * Al pasar a cancelled, el exclusion constraint deja de contarlas y las
 * fechas quedan libres de nuevo.
 * No toca payment_status='review' (comprobante subido, esperando al admin).
 * Protegido con CRON_SECRET, igual que el import de iCal.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const hours = Number(process.env.RESERVATION_EXPIRY_HOURS ?? 24);
  const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();

  const { data, error } = await supabaseAdmin()
    .from("reservations")
    .update({ status: "cancelled", notes: `Expirada: sin pago en ${hours}h` })
    .eq("status", "pending")
    .eq("payment_status", "unpaid")
    .lt("created_at", cutoff)
    .select("id, guest_email, check_in, check_out");

  if (error) {
    console.error("[expire-pending]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.length) {
    console.log(`[expire-pending] ${data.length} reservas expiradas y fechas liberadas`);
    // reservas expiradas → cancelar sus mensajes programados pendientes
    // (las pending sin pago normalmente no tienen timeline, pero por si acaso)
    const { error: msgErr } = await supabaseAdmin()
      .from("scheduled_messages")
      .update({ status: "cancelled" })
      .in("reservation_id", data.map((r) => r.id))
      .eq("status", "pending");
    if (msgErr) console.error("[expire-pending] mensajes:", msgErr.message);
  }
  return NextResponse.json({
    expired: data?.length ?? 0,
    window_hours: hours,
    reservations: (data ?? []).map((r) => ({ id: r.id, check_in: r.check_in, check_out: r.check_out })),
  });
}
