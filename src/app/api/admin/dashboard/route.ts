import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { todayInPropertyTz } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dashboard — el INICIO del panel (módulo A):
 * - comprobantes esperando confirmación (con el comprobante embebible:
 *   URL firmada de 1 h) — la acción más urgente del día, va arriba.
 * - hoy llega / hoy sale con contactos
 * - ingresos del mes (reservas confirmadas + snacks pagados)
 * - ocupación del mes (% noches vendidas)
 * - reseñas pendientes de moderar
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const db = supabaseAdmin();
  const hoy = todayInPropertyTz();
  const mesInicio = hoy.slice(0, 7) + "-01";
  const mesFin = new Date(new Date(mesInicio + "T12:00:00Z").getFullYear(),
    new Date(mesInicio + "T12:00:00Z").getMonth() + 1, 1).toISOString().slice(0, 10);

  const [pendientes, llegan, salen, confirmadasMes, snacksMes, reviewsPend] = await Promise.all([
    db.from("reservations")
      .select("id, guest_name, guest_email, guest_phone, check_in, check_out, num_guests, total, deposit_amount, payment_proof_url, created_at")
      .eq("status", "pending").eq("payment_status", "review")
      .order("created_at", { ascending: true }),
    db.from("reservations")
      .select("id, guest_name, guest_phone, guest_email, num_guests, check_out, arrival_time, pet_count")
      .eq("status", "confirmed").eq("check_in", hoy),
    db.from("reservations")
      .select("id, guest_name, guest_phone, num_guests, check_in")
      .eq("status", "confirmed").eq("check_out", hoy),
    db.from("reservations")
      .select("total, check_in, check_out, nights")
      .in("status", ["confirmed", "completed"])
      .gte("check_in", mesInicio).lt("check_in", mesFin),
    db.from("snack_orders").select("total_cents").eq("status", "paid")
      .gte("created_at", mesInicio),
    db.from("reviews").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  // comprobantes con URL firmada (1 h) para verlos embebidos en el panel
  const comprobantes = await Promise.all(
    (pendientes.data ?? []).map(async (r) => {
      let proof_url: string | null = null;
      let proof_is_pdf = false;
      if (r.payment_proof_url) {
        const { data } = await db.storage.from("payment-proofs")
          .createSignedUrl(r.payment_proof_url, 3600);
        proof_url = data?.signedUrl ?? null;
        proof_is_pdf = r.payment_proof_url.endsWith(".pdf");
      }
      return { ...r, proof_url, proof_is_pdf };
    })
  );

  const ingresosReservas = (confirmadasMes.data ?? []).reduce((s, r) => s + Number(r.total), 0);
  const ingresosSnacks = (snacksMes.data ?? []).reduce((s, o) => s + o.total_cents / 100, 0);
  const nochesVendidas = (confirmadasMes.data ?? []).reduce((s, r) => s + (r.nights ?? 0), 0);
  const diasMes = Math.round((Date.parse(mesFin) - Date.parse(mesInicio)) / 86_400_000);

  return NextResponse.json({
    hoy,
    comprobantes_pendientes: comprobantes,
    hoy_llegan: llegan.data ?? [],
    hoy_salen: salen.data ?? [],
    ingresos_mes: {
      reservas: Math.round(ingresosReservas * 100) / 100,
      snacks: Math.round(ingresosSnacks * 100) / 100,
      total: Math.round((ingresosReservas + ingresosSnacks) * 100) / 100,
    },
    ocupacion_mes: {
      noches_vendidas: nochesVendidas,
      noches_disponibles: diasMes,
      porcentaje: diasMes ? Math.round((nochesVendidas / diasMes) * 100) : 0,
    },
    reviews_pendientes: reviewsPend.count ?? 0,
  });
}
