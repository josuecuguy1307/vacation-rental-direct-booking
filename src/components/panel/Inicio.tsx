"use client";

import { useCallback, useEffect, useState } from "react";
import { api, codigo, fmtFecha, money } from "./api";

/* Inicio — la primera pantalla. Solo lo diario, de más urgente a contexto:
   1) comprobantes por confirmar (acción prioritaria, comprobante embebido,
      mismo endpoint idempotente que los botones del correo),
   2) quién llega / sale hoy,
   3) un pulso simple del mes (2 datos, no 4) + aviso de reseñas.
   En móvil, lo importante entra sin scroll. */

type Comprobante = {
  id: string; guest_name: string; guest_email: string; guest_phone: string | null;
  check_in: string; check_out: string; num_guests: number;
  total: number; deposit_amount: number;
  proof_url: string | null; proof_is_pdf: boolean; created_at: string;
};

type Dash = {
  hoy: string;
  comprobantes_pendientes: Comprobante[];
  hoy_llegan: { id: string; guest_name: string; guest_phone: string | null; num_guests: number; check_out: string; arrival_time: string | null; pet_count: number | null }[];
  hoy_salen: { id: string; guest_name: string; guest_phone: string | null; num_guests: number }[];
  ingresos_mes: { reservas: number; snacks: number; total: number };
  ocupacion_mes: { noches_vendidas: number; noches_disponibles: number; porcentaje: number };
  reviews_pendientes: number;
};

export default function Inicio({
  onVerReservas, onVerCaja, onVerResenas,
}: { onVerReservas: () => void; onVerCaja: () => void; onVerResenas: () => void }) {
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setD(await api<Dash>("/api/admin/dashboard"));
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decidir = async (r: Comprobante, action: "confirmar" | "rechazar") => {
    let motivo: string | undefined;
    if (action === "confirmar") {
      if (!window.confirm(`¿Confirmar el pago de ${r.guest_name} (${money(r.total)})?\nSe le enviará la confirmación con su recibo.`)) return;
    } else {
      const m = window.prompt(
        "Motivo del rechazo (opcional — se le enviará al huésped para que reintente):", ""
      );
      if (m === null) return; // canceló
      motivo = m.trim() || undefined;
    }
    setBusyId(r.id);
    setOkMsg("");
    try {
      const res = await api<{ ok: boolean; already?: boolean }>(
        `/api/admin/reservations/${r.id}/decision`,
        { method: "POST", body: JSON.stringify({ action, motivo }) }
      );
      setOkMsg(
        res.already
          ? "Esta reserva ya estaba confirmada (quizá desde el correo) — todo en orden."
          : action === "confirmar"
            ? `Pago confirmado ✓ — ${r.guest_name} ya recibió su confirmación.`
            : `Comprobante rechazado — se le avisó a ${r.guest_name} para que reintente.`
      );
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId("");
    }
  };

  if (err && !d) return <div className="pn-msg bad">{err}</div>;
  if (!d) return <p className="pn-muted">Cargando…</p>;

  return (
    <>
      {okMsg && <div className="pn-msg ok">{okMsg}</div>}
      {err && <div className="pn-msg bad">{err}</div>}

      {/* ── comprobantes por confirmar: SIEMPRE arriba ── */}
      {d.comprobantes_pendientes.length > 0 && (
        <>
          <h2>🔔 Comprobantes por confirmar ({d.comprobantes_pendientes.length})</h2>
          {d.comprobantes_pendientes.map((r) => (
            <div key={r.id} className="pn-card urgent">
              <div className="pn-row" style={{ justifyContent: "space-between" }}>
                <b>{r.guest_name}</b>
                <span className="pn-badge warn">Esperando tu confirmación</span>
              </div>
              <p className="pn-muted" style={{ margin: "6px 0" }}>
                {codigo(r.id)} · {fmtFecha(r.check_in)} → {fmtFecha(r.check_out)} · {r.num_guests} huésped(es)
                <br />
                Monto esperado: <b style={{ color: "var(--pv)" }}>{money(r.deposit_amount || r.total)}</b>
              </p>

              {r.proof_url ? (
                r.proof_is_pdf ? (
                  <iframe className="pn-proof-pdf" src={r.proof_url} title="Comprobante PDF" />
                ) : (
                  <a href={r.proof_url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="pn-proof" src={r.proof_url} alt="Comprobante de transferencia" />
                  </a>
                )
              ) : (
                <p className="pn-msg bad">No se pudo cargar el comprobante — ábrelo desde Reservas.</p>
              )}
              {r.proof_url && (
                <p className="pn-muted" style={{ marginTop: 0 }}>
                  Toca la imagen para verla en grande.
                </p>
              )}

              <div className="pn-row" style={{ marginTop: 8 }}>
                <button
                  className="btn ok"
                  style={{ flex: 2 }}
                  disabled={busyId === r.id}
                  onClick={() => decidir(r, "confirmar")}
                >
                  ✓ Confirmar pago
                </button>
                <button
                  className="btn bad"
                  style={{ flex: 1 }}
                  disabled={busyId === r.id}
                  onClick={() => decidir(r, "rechazar")}
                >
                  ✗ Rechazar
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── hoy llega / sale ── */}
      <h2>Hoy · {fmtFecha(d.hoy)}</h2>

      <div className="pn-card">
        <h3>🛬 Hoy llegan</h3>
        {d.hoy_llegan.length === 0 && <p className="pn-muted">Nadie llega hoy.</p>}
        {d.hoy_llegan.map((g) => (
          <div key={g.id} className="pn-row" style={{ padding: "6px 0", borderBottom: "1px solid var(--pborde)" }}>
            <div style={{ flex: 1 }}>
              <b>{g.guest_name}</b>
              <div className="pn-muted">
                {g.num_guests} huésped(es) · hasta {fmtFecha(g.check_out)}
                {g.arrival_time ? ` · llega ~${g.arrival_time}` : ""}
                {g.pet_count ? ` · 🐾 ${g.pet_count}` : ""}
              </div>
            </div>
            {g.guest_phone && (
              <a className="pn-badge ok" href={`https://wa.me/${g.guest_phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="pn-card">
        <h3>🧳 Hoy salen</h3>
        {d.hoy_salen.length === 0 && <p className="pn-muted">Nadie sale hoy.</p>}
        {d.hoy_salen.map((g) => (
          <div key={g.id} className="pn-row" style={{ padding: "6px 0" }}>
            <div style={{ flex: 1 }}>
              <b>{g.guest_name}</b> <span className="pn-muted">· {g.num_guests} huésped(es)</span>
            </div>
            {g.guest_phone && (
              <a className="pn-badge ok" href={`https://wa.me/${g.guest_phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            )}
          </div>
        ))}
      </div>

      {/* ── pulso del mes: 2 datos, no 4 ── */}
      <h2>Pulso del mes</h2>
      <div className="pn-pulse">
        <button onClick={onVerCaja}>
          <b>{money(d.ingresos_mes.total)}</b>
          <span>Ingresos del mes · ver caja →</span>
        </button>
        <div className="cell">
          <b>{d.ocupacion_mes.porcentaje}%</b>
          <span>Ocupación ({d.ocupacion_mes.noches_vendidas}/{d.ocupacion_mes.noches_disponibles} noches)</span>
        </div>
      </div>

      <button className="pn-nudge" onClick={onVerResenas}>
        <span>
          ⭐ {d.reviews_pendientes > 0
            ? `${d.reviews_pendientes} reseña(s) por moderar`
            : "Reseñas"}
        </span>
        <span className="arrow">→</span>
      </button>

      <div className="pn-row" style={{ marginTop: 12 }}>
        <button className="btn plain btn-fill" onClick={onVerReservas}>Ver todas las reservas →</button>
      </div>
    </>
  );
}
