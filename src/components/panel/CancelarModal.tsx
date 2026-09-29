"use client";

import { useState } from "react";
import { api, money, type Reserva } from "./api";

/* Cancelar una reserva con DOBLE confirmación (dos pasos explícitos, no un
   solo clic) + nota opcional. Tras cancelar de verdad, muestra el flujo de
   DEVOLUCIÓN (qué reembolsar) y remite a la garantía, que se dispara con el
   gancho existente (GarantiaCard en el detalle). No mueve dinero por sí solo. */

type Paso = "intencion" | "confirmar" | "hecho";

export default function CancelarModal({
  reserva,
  onClose,
  onCancelled,
}: {
  reserva: Reserva;
  onClose: () => void;
  onCancelled: () => void; // refresca el detalle (la reserva ya quedó cancelada)
}) {
  const [paso, setPaso] = useState<Paso>("intencion");
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pagada = reserva.status === "confirmed" || reserva.status === "completed";
  const anticipo = Number(reserva.deposit_amount ?? 0);
  const garCents = Number(reserva.garantia_amount_cents ?? 0);
  const garPend = garCents > 0 && reserva.garantia_estado !== "reembolsada";

  const cancelar = async () => {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/admin/reservations/${reserva.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "cancel", notes: nota.trim() || undefined }),
      });
      setPaso("hecho");
      onCancelled();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pn-modal-back" onClick={busy ? undefined : onClose}>
      <div className="pn-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {err && <div className="pn-msg bad">{err}</div>}

        {paso === "intencion" && (
          <>
            <h3 className="pn-modal-title">¿Cancelar esta reserva?</h3>
            <p className="pn-muted">
              <b>{reserva.guest_name}</b> · {reserva.check_in} → {reserva.check_out}
            </p>
            <p className="pn-muted">
              Al cancelar, <b>las fechas quedan libres</b> y se cancelan los mensajes
              automáticos que faltaban por enviarse. Esto no se puede deshacer.
            </p>
            <label className="f">
              <span>Nota (opcional) — por qué se cancela</span>
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej: el huésped pidió cambio de fechas…"
                style={{ minHeight: 70 }}
              />
            </label>
            <div className="pn-row" style={{ marginTop: 4 }}>
              <button className="btn plain btn-fill" onClick={onClose}>No, volver</button>
              <button className="btn bad btn-fill" onClick={() => setPaso("confirmar")}>
                Sí, continuar
              </button>
            </div>
          </>
        )}

        {paso === "confirmar" && (
          <>
            <h3 className="pn-modal-title">Confirmar cancelación</h3>
            <p className="pn-muted">
              Vas a <b style={{ color: "var(--pbad)" }}>cancelar definitivamente</b> la reserva de{" "}
              <b>{reserva.guest_name}</b>. Toca el botón rojo para confirmar.
            </p>
            {nota.trim() && (
              <p className="pn-muted">Nota que se guardará: “{nota.trim()}”</p>
            )}
            <div className="pn-row" style={{ marginTop: 4 }}>
              <button className="btn plain btn-fill" disabled={busy} onClick={() => setPaso("intencion")}>
                ← Atrás
              </button>
              <button className="btn bad btn-fill" disabled={busy} onClick={cancelar}>
                {busy ? "Cancelando…" : "Cancelar definitivamente"}
              </button>
            </div>
          </>
        )}

        {paso === "hecho" && (
          <>
            <h3 className="pn-modal-title">Reserva cancelada ✓</h3>
            <p className="pn-muted">Las fechas quedaron libres y los mensajes pendientes se cancelaron.</p>

            {(pagada && (anticipo > 0 || garPend)) ? (
              <div className="pn-card" style={{ margin: "8px 0" }}>
                <h4 style={{ margin: "0 0 6px" }}>Devolución</h4>
                {anticipo > 0 && (
                  <p className="pn-muted" style={{ margin: "0 0 6px" }}>
                    Anticipo cobrado: <b>{money(anticipo)}</b>. Payphone no reembolsa por API:
                    hazlo manual (transferencia o reverso) según tu política y avísale al huésped.
                  </p>
                )}
                {garPend && (
                  <p className="pn-muted" style={{ margin: 0 }}>
                    La <b>garantía ({money(garCents / 100)})</b> sigue pendiente — regístrala como
                    devuelta abajo, en la tarjeta “Garantía”.
                  </p>
                )}
              </div>
            ) : (
              <p className="pn-muted">No hay pagos que devolver.</p>
            )}

            <button className="btn dark btn-fill" onClick={onClose}>Listo</button>
          </>
        )}
      </div>
    </div>
  );
}
