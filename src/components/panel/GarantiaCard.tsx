"use client";

import { useState } from "react";
import { api, fmtFecha, money, type Reserva } from "./api";

/* Tarjeta de la GARANTÍA reembolsable ($30, Lane 2). Muestra el estado
   (pendiente / reembolsada) y deja a la dueña disparar el reembolso con el
   gancho existente: POST …/[id]/garantia → lib/garantia.refundGuarantee
   (idempotente, envía comprobante al huésped + aviso a la dueña). */

type GMetodo = "tarjeta" | "transferencia";

export default function GarantiaCard({
  reserva,
  onChanged,
}: {
  reserva: Reserva;
  onChanged: () => void; // refresca el detalle
}) {
  const cents = Number(reserva.garantia_amount_cents ?? 0);
  const [metodo, setMetodo] = useState<GMetodo>(
    reserva.garantia_metodo === "transferencia" ? "transferencia" : "tarjeta"
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  // Sin garantía cobrada → no se muestra la tarjeta.
  if (cents <= 0) return null;

  const reembolsada = reserva.garantia_estado === "reembolsada";

  const reembolsar = async () => {
    if (!window.confirm(`¿Registrar la garantía de ${money(cents / 100)} como DEVUELTA (${metodo})?\nSe le enviará el comprobante al huésped.`)) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const r = await api<{ already?: boolean }>(`/api/admin/reservations/${reserva.id}/garantia`, {
        method: "POST",
        body: JSON.stringify({ action: "refund", metodo }),
      });
      setOk(r.already ? "La garantía ya estaba devuelta." : "Garantía devuelta ✓ — el huésped recibió su comprobante.");
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`pn-card${!reembolsada ? " pn-gar-pend" : ""}`}>
      <div className="pn-row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Garantía reembolsable</h3>
        <span className={`pn-badge ${reembolsada ? "ok" : "warn"}`}>
          {reembolsada ? "Devuelta ✓" : "Pendiente"}
        </span>
      </div>

      {ok && <div className="pn-msg ok" style={{ marginTop: 8 }}>{ok}</div>}
      {err && <div className="pn-msg bad" style={{ marginTop: 8 }}>{err}</div>}

      {reembolsada ? (
        <p className="pn-muted" style={{ marginBottom: 0 }}>
          {money(cents / 100)} devueltos
          {reserva.garantia_metodo ? ` (${reserva.garantia_metodo})` : ""}
          {reserva.garantia_refunded_at ? ` · ${fmtFecha(reserva.garantia_refunded_at.slice(0, 10))}` : ""}.
        </p>
      ) : (
        <>
          <p style={{ margin: "8px 0" }}>
            Monto a devolver: <b>{money(cents / 100)}</b>
          </p>
          <label className="f">
            <span>¿Cómo se la devuelves?</span>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value as GMetodo)}>
              <option value="tarjeta">A su tarjeta</option>
              <option value="transferencia">Por transferencia</option>
            </select>
          </label>
          <button className="btn ok btn-fill" disabled={busy} onClick={reembolsar}>
            {busy ? "Registrando…" : "✓ Marcar garantía como devuelta"}
          </button>
          <p className="pn-muted" style={{ margin: "8px 0 0" }}>
            Registra la devolución y avisa al huésped. El movimiento del dinero lo haces tú
            (Payphone no reembolsa por API).
          </p>
        </>
      )}
    </div>
  );
}
