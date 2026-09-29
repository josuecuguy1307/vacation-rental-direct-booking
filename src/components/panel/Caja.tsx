"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiDownload, money } from "./api";
import { SITE } from "@/config/site.config";

/* Módulo C — CAJA: ingresos por rango, por método y por concepto,
   con neto estimado (comisión Payphone referencial) y export CSV. */

type CajaData = {
  from: string; to: string;
  filas: { fecha: string; concepto: string; detalle: string; metodo: string; monto: number }[];
  por_metodo: Record<string, number>;
  por_concepto: Record<string, number>;
  bruto: number; comision_payphone_estimada: number; neto_estimado: number;
  nota: string;
};

const hoyEc = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: SITE.timezone });

export default function Caja() {
  const [from, setFrom] = useState(hoyEc().slice(0, 7) + "-01");
  const [to, setTo] = useState(hoyEc());
  const [d, setD] = useState<CajaData | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setD(await api<CajaData>(`/api/admin/caja?from=${from}&to=${to}`));
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <h2>Caja</h2>
      {err && <div className="pn-msg bad">{err}</div>}

      <div className="grid2" style={{ marginBottom: 12 }}>
        <label className="f">
          <span>Desde</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="f">
          <span>Hasta</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {d && (
        <>
          <div className="pn-kpis">
            <div className="pn-kpi"><b>{money(d.bruto)}</b><span>Ingresos brutos</span></div>
            <div className="pn-kpi"><b>{money(d.neto_estimado)}</b><span>Neto estimado*</span></div>
            <div className="pn-kpi"><b>{money(d.por_concepto.reserva ?? 0)}</b><span>Reservas</span></div>
            <div className="pn-kpi"><b>{money(d.por_concepto.snacks ?? 0)}</b><span>Snacks</span></div>
          </div>

          <div className="pn-card">
            <h3>Por método de pago</h3>
            <table>
              <tbody>
                {Object.entries(d.por_metodo).map(([m, v]) => (
                  <tr key={m}>
                    <td style={{ textTransform: "capitalize" }}>{m}</td>
                    <td style={{ textAlign: "right" }}><b>{money(v)}</b></td>
                  </tr>
                ))}
                {Object.keys(d.por_metodo).length === 0 && (
                  <tr><td className="pn-muted">Sin movimientos en este rango.</td></tr>
                )}
              </tbody>
            </table>
            <p className="pn-muted" style={{ marginTop: 8 }}>
              * {d.nota}{" "}
              {d.comision_payphone_estimada > 0 && (
                <>Comisión estimada de este rango: {money(d.comision_payphone_estimada)}.</>
              )}
            </p>
          </div>

          <div className="pn-card">
            <h3>Movimientos ({d.filas.length})</h3>
            <table>
              <thead>
                <tr><th>Fecha</th><th>Detalle</th><th style={{ textAlign: "right" }}>Monto</th></tr>
              </thead>
              <tbody>
                {d.filas.map((f, i) => (
                  <tr key={i}>
                    <td>{f.fecha.slice(5)}</td>
                    <td>
                      {f.detalle}
                      <br />
                      <span className="pn-muted">{f.concepto} · {f.metodo}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>{money(f.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            className="btn dark btn-fill"
            disabled={busy || d.filas.length === 0}
            onClick={async () => {
              setBusy(true);
              try {
                await apiDownload(
                  `/api/admin/caja?from=${from}&to=${to}&format=csv`,
                  `caja-${SITE.slug}-${from}-a-${to}.csv`
                );
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            ⬇️ Descargar CSV (Excel)
          </button>
        </>
      )}
    </>
  );
}
