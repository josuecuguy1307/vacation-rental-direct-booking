"use client";

import { useCallback, useEffect, useState } from "react";
import { api, codigo, esPagada, estadoInfo, estadoTri, fmtFecha, money, type Reserva } from "./api";
import GarantiaCard from "./GarantiaCard";
import CancelarModal from "./CancelarModal";
import TimelineHospedaje, { type TlItem } from "./TimelineHospedaje";

/* Detalle completo de una reserva: toda la info, anidada y agrupada. Reusa
   los endpoints existentes (detalle, snacks, saldo, decisión, reenvío) y los
   ganchos de Lane 2 (garantía). Timeline del hospedaje arriba cuando la
   reserva está pagada. */

type Snacks = {
  tab: { items: { nombre: string; precio_unit_cents: number; cantidad: number }[]; total_cents: number };
  settled_cents: number;
} | null;

const PLANTILLAS = [
  { key: "confirmacion", label: "Confirmación (con recibo PDF)" },
  { key: "antes_llegada", label: "Antes de la llegada (indicaciones)" },
  { key: "despues_primera_noche", label: "Después de la primera noche" },
  { key: "antes_salida", label: "Antes de la salida" },
  { key: "despues_salida", label: "Despedida + reseña" },
  { key: "recordatorio_saldo", label: "Recordatorio de saldo" },
];

const cents = (n: number | null | undefined) => Math.round(Number(n ?? 0) * 100);
const metodoLabel = (m?: string | null) =>
  m === "cash" ? "efectivo" : m?.includes("payphone") ? "Payphone" : m ? "transferencia" : "—";

export default function ReservaDetalle({
  id,
  onBack,
  onChanged,
}: {
  id: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [sel, setSel] = useState<Reserva | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [snacks, setSnacks] = useState<Snacks>(null);
  const [tl, setTl] = useState<TlItem[] | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [tplKey, setTplKey] = useState("confirmacion");
  const [showCancel, setShowCancel] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ reservation: Reserva; payment_proof_signed_url: string | null }>(
        `/api/admin/reservations/${id}`
      );
      setSel(r.reservation);
      setProofUrl(r.payment_proof_signed_url);
      setErr("");
      // secundarios: no bloquean el detalle
      api<Snacks>(`/api/admin/reservations/${id}/snacks`).then(setSnacks).catch(() => setSnacks(null));
      api<{ items: TlItem[] }>(`/api/admin/reservations/${id}/timeline`)
        .then((d) => setTl(d.items))
        .catch(() => setTl([]));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const accion = async (fn: () => Promise<string>) => {
    setBusy(true);
    setOk("");
    setErr("");
    try {
      const msg = await fn();
      setOk(msg);
      await load();
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!sel) {
    return (
      <>
        <button className="btn plain sm" onClick={onBack}>← Volver a la lista</button>
        {err ? <div className="pn-msg bad">{err}</div> : <p className="pn-muted">Cargando…</p>}
      </>
    );
  }

  const est = estadoInfo(estadoTri(sel));
  const saldo = (sel.balance_due_cents ?? 0) / 100;
  const esPdf = proofUrl?.includes(".pdf");
  const snPend = snacks?.tab.total_cents ?? 0;
  const snItems = snacks?.tab.items ?? [];
  const snSettled = snacks?.settled_cents ?? 0;

  // ── montos desglosados (siempre reconcilian con el total) ──
  const totalC = cents(sel.total);
  const subC = cents(sel.subtotal);
  const extrasC = cents(sel.extras_total);
  const limpC = cents(sel.cleaning_fee);
  const garC = Number(sel.garantia_amount_cents ?? 0);
  const otrosC = Math.max(0, totalC - subC - extrasC - limpC - garC); // mascota u otros
  const desglose: [string, number][] = [
    ["Alojamiento", subC],
    ...(extrasC > 0 ? [["Extras", extrasC] as [string, number]] : []),
    ...(limpC > 0 ? [["Limpieza", limpC] as [string, number]] : []),
    ...(otrosC > 0 ? [[sel.pet_count ? "Mascota" : "Otros", otrosC] as [string, number]] : []),
    ...(garC > 0 ? [["Garantía (reembolsable)", garC] as [string, number]] : []),
  ];

  return (
    <>
      <button className="btn plain sm" onClick={onBack}>← Volver a la lista</button>
      <h2 style={{ marginTop: 10 }}>
        {codigo(sel.id)} <span className={`pn-badge ${est.tone}`}>{est.texto}</span>
      </h2>
      {ok && <div className="pn-msg ok">{ok}</div>}
      {err && <div className="pn-msg bad">{err}</div>}

      {/* Timeline del hospedaje — solo para reservas pagadas */}
      {esPagada(sel) && tl && <TimelineHospedaje reserva={sel} items={tl} />}

      {/* Huésped */}
      <div className="pn-card">
        <h3>Huésped</h3>
        <p>
          <b>{sel.guest_name}</b>
          <br />
          <a href={`mailto:${sel.guest_email}`}>{sel.guest_email}</a>
          {sel.guest_phone && (
            <>
              <br />
              <a href={`https://wa.me/${sel.guest_phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                {sel.guest_phone} (WhatsApp)
              </a>
            </>
          )}
        </p>
        <p className="pn-muted">
          {sel.guest_document ? <>Documento: {sel.guest_document}<br /></> : null}
          {sel.guest_country ? <>País: {sel.guest_country}<br /></> : null}
          {sel.arrival_time ? <>Hora estimada de llegada: {sel.arrival_time}<br /></> : null}
          {sel.pet_count ? <>Mascotas: 🐾 {sel.pet_count}<br /></> : null}
        </p>
        {sel.guest_message && <p className="pn-muted">💬 “{sel.guest_message}”</p>}
        {sel.status === "cancelled" && sel.notes && (
          <p className="pn-muted">📝 Nota de cancelación: “{sel.notes}”</p>
        )}
      </div>

      {/* Estadía + montos desglosados */}
      <div className="pn-card">
        <h3>Estadía y pago</h3>
        <p>
          {fmtFecha(sel.check_in)} → {fmtFecha(sel.check_out)}
          {sel.nights ? ` · ${sel.nights} noche(s)` : ""} · {sel.num_guests} huésped(es)
        </p>
        {!!sel.reservation_addons?.length && (
          <p className="pn-muted">
            Extras: {sel.reservation_addons.map((a) => `${a.addons?.name ?? "extra"} ×${a.quantity}`).join(", ")}
          </p>
        )}
        <ul className="pn-desglose">
          {desglose.map(([label, c]) => (
            <li key={label}>
              <span>{label}</span>
              <span>{money(c / 100)}</span>
            </li>
          ))}
          <li className="total">
            <span>Total</span>
            <span>{money(sel.total)}</span>
          </li>
        </ul>
        <p className="pn-muted" style={{ marginBottom: 0 }}>
          Anticipo cobrado: <b>{money(sel.deposit_amount)}</b>
          {saldo > 0 && <> · Saldo pendiente: <b style={{ color: "var(--pbad)" }}>{money(saldo)}</b></>}
          <br />
          Método: {metodoLabel(sel.payment_method)} · Estado de pago: {sel.payment_status}
        </p>
      </div>

      {/* Snacks */}
      <div className="pn-card">
        <h3>Cuenta de snacks</h3>
        {snacks === null ? (
          <p className="pn-muted">Cargando…</p>
        ) : snPend === 0 && snSettled === 0 ? (
          <p className="pn-muted">Sin consumos de snacks.</p>
        ) : (
          <>
            {snItems.length > 0 && (
              <ul style={{ listStyle: "none", margin: "0 0 8px", padding: 0 }}>
                {snItems.map((it, i) => (
                  <li key={i} className="pn-row" style={{ justifyContent: "space-between", padding: "3px 0" }}>
                    <span>{it.nombre} ×{it.cantidad}</span>
                    <span>{money((it.precio_unit_cents * it.cantidad) / 100)}</span>
                  </li>
                ))}
              </ul>
            )}
            {snPend > 0 ? (
              <p><b>Pendiente de cobro: <span style={{ color: "var(--pbad)" }}>{money(snPend / 100)}</span></b></p>
            ) : (
              <p className="pn-muted">Todo cobrado. ✓</p>
            )}
            {snSettled > 0 && <p className="pn-muted">Ya cobrado antes: {money(snSettled / 100)}</p>}
            {snPend > 0 && (
              <div className="pn-row" style={{ marginTop: 6 }}>
                <button
                  className="btn ok sm"
                  disabled={busy}
                  onClick={() =>
                    window.confirm(`¿Registrar ${money(snPend / 100)} de snacks como pagados por TRANSFERENCIA?`) &&
                    accion(async () => {
                      const r = await api<{ total_cents?: number }>(`/api/admin/reservations/${sel.id}/snacks`, {
                        method: "POST",
                        body: JSON.stringify({ action: "mark_paid", method: "transfer" }),
                      });
                      return `Snacks liquidados por transferencia ✓ (${money((r.total_cents ?? 0) / 100)})`;
                    })
                  }
                >
                  ✓ Pagados por transferencia
                </button>
                <button
                  className="btn dark sm"
                  disabled={busy}
                  onClick={() =>
                    window.confirm(`¿Registrar ${money(snPend / 100)} de snacks como pagados en EFECTIVO?`) &&
                    accion(async () => {
                      const r = await api<{ total_cents?: number }>(`/api/admin/reservations/${sel.id}/snacks`, {
                        method: "POST",
                        body: JSON.stringify({ action: "mark_paid", method: "cash" }),
                      });
                      return `Snacks liquidados en efectivo ✓ (${money((r.total_cents ?? 0) / 100)})`;
                    })
                  }
                >
                  💵 Efectivo
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Garantía (Lane 2) */}
      <GarantiaCard reserva={sel} onChanged={() => { load(); onChanged(); }} />

      {/* Comprobante (legacy: solo si existe uno subido) */}
      {proofUrl && (
        <div className="pn-card">
          <h3>Comprobante de transferencia</h3>
          {esPdf ? (
            <iframe className="pn-proof-pdf" src={proofUrl} title="Comprobante" />
          ) : (
            <a href={proofUrl} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="pn-proof" src={proofUrl} alt="Comprobante" />
            </a>
          )}
        </div>
      )}

      {/* Acciones agrupadas */}
      <div className="pn-card">
        <h3>Acciones</h3>

        {sel.status === "pending" && (
          <p className="pn-muted" style={{ marginTop: 0, marginBottom: 10 }}>
            Aún sin pago. La reserva se confirma sola cuando el huésped paga por Payphone
            (y si no completa, Payphone reversa el cobro). No se marca a mano.
          </p>
        )}

        {saldo > 0 && sel.status === "confirmed" && (
          <button
            className="btn dark btn-fill"
            style={{ marginBottom: 10 }}
            disabled={busy}
            onClick={() =>
              window.confirm(`¿Registrar el saldo de ${money(saldo)} como pagado en efectivo?`) &&
              accion(async () => {
                await api(`/api/admin/reservations/${sel.id}/balance`, {
                  method: "POST", body: JSON.stringify({ action: "mark_paid", method: "cash" }),
                });
                return "Saldo registrado como pagado ✓";
              })
            }
          >
            💵 Saldo pagado en efectivo
          </button>
        )}

        {sel.status === "confirmed" && (
          <div style={{ borderBottom: "1px solid var(--pborde)", paddingBottom: 10, marginBottom: 10 }}>
            <label className="f">
              <span>Reenviar un correo al huésped</span>
              <select value={tplKey} onChange={(e) => setTplKey(e.target.value)}>
                {PLANTILLAS.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </label>
            <button
              className="btn plain"
              disabled={busy}
              onClick={() =>
                accion(async () => {
                  await api(`/api/admin/reservations/${sel.id}/resend`, {
                    method: "POST", body: JSON.stringify({ template_key: tplKey }),
                  });
                  return `Correo reenviado a ${sel.guest_email} ✓`;
                })
              }
            >
              ✉️ Reenviar este correo
            </button>
          </div>
        )}

        {sel.status !== "cancelled" ? (
          <button className="btn bad btn-fill" disabled={busy} onClick={() => setShowCancel(true)}>
            Cancelar reserva
          </button>
        ) : (
          <p className="pn-muted" style={{ margin: 0 }}>Reserva cancelada. Las fechas están libres.</p>
        )}
      </div>

      {showCancel && (
        <CancelarModal
          reserva={sel}
          onClose={() => setShowCancel(false)}
          onCancelled={() => { load(); onChanged(); }}
        />
      )}
    </>
  );
}
