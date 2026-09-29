import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

const PAYPHONE_FEE = 0.0575; // comisión aprox de Payphone (referencial)

/**
 * GET /api/admin/caja?from=YYYY-MM-DD&to=YYYY-MM-DD[&format=csv]
 * Ingresos por método (payphone / transferencia / efectivo) y por concepto
 * (reservas / snacks), con neto estimado tras la comisión ~5.75% de Payphone.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? new Date().toISOString().slice(0, 7) + "-01";
  const to = sp.get("to") ?? new Date().toISOString().slice(0, 10);

  const db = supabaseAdmin();
  const [reservas, snacks] = await Promise.all([
    db.from("reservations")
      .select("id, guest_name, check_in, check_out, total, payment_method, balance_method, created_at")
      .in("status", ["confirmed", "completed"])
      .gte("check_in", from).lte("check_in", to)
      .order("check_in"),
    db.from("snack_orders")
      .select("id, total_cents, customer_email, created_at")
      .eq("status", "paid")
      .gte("created_at", from).lte("created_at", to + "T23:59:59Z")
      .order("created_at"),
  ]);

  type Fila = { fecha: string; concepto: string; detalle: string; metodo: string; monto: number };
  const filas: Fila[] = [];
  const metodoLabel = (m: string | null) =>
    m === "payphone" || m === "payphone_link" ? "payphone"
    : m === "cash" ? "efectivo" : "transferencia";

  for (const r of reservas.data ?? []) {
    filas.push({
      fecha: r.check_in,
      concepto: "reserva",
      detalle: `${SITE.bookingCodePrefix}-${r.id.slice(0, 8).toUpperCase()} ${r.guest_name} (${r.check_in} a ${r.check_out})`,
      metodo: metodoLabel(r.payment_method),
      monto: Number(r.total),
    });
  }
  for (const o of snacks.data ?? []) {
    filas.push({
      fecha: String(o.created_at).slice(0, 10),
      concepto: "snacks",
      detalle: `SN-${o.id.slice(0, 8).toUpperCase()}${o.customer_email ? ` ${o.customer_email}` : ""}`,
      metodo: "payphone",
      monto: o.total_cents / 100,
    });
  }
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha));

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const porMetodo: Record<string, number> = {};
  const porConcepto: Record<string, number> = {};
  let bruto = 0, comision = 0;
  for (const f of filas) {
    porMetodo[f.metodo] = r2((porMetodo[f.metodo] ?? 0) + f.monto);
    porConcepto[f.concepto] = r2((porConcepto[f.concepto] ?? 0) + f.monto);
    bruto += f.monto;
    if (f.metodo === "payphone") comision += f.monto * PAYPHONE_FEE;
  }

  if (sp.get("format") === "csv") {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [
      "fecha,concepto,detalle,metodo,monto",
      ...filas.map((f) => `${f.fecha},${f.concepto},${esc(f.detalle)},${f.metodo},${f.monto.toFixed(2)}`),
    ].join("\n");
    return new NextResponse("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="caja-${SITE.slug}-${from}-a-${to}.csv"`,
      },
    });
  }

  return NextResponse.json({
    from, to, filas,
    por_metodo: porMetodo,
    por_concepto: porConcepto,
    bruto: r2(bruto),
    comision_payphone_estimada: r2(comision),
    neto_estimado: r2(bruto - comision),
    nota: "Comisión Payphone referencial ~5.75% — el valor exacto lo liquida Payphone.",
  });
}
