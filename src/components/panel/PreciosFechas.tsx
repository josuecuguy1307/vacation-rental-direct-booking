"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtFecha, money } from "./api";

/* Módulo G — PRECIOS: precios base entre semana / fin de semana + CRUD de
   temporadas (el motor de precios existente).
   Módulo H — DISPONIBILIDAD: bloqueos manuales de fechas. */

type Prop = {
  weekday_price_cents: number; weekend_price_cents: number;
  extra_guest_price_cents: number; pet_price_cents: number; included_guests: number;
  max_guests: number; min_nights: number;
};
type Season = {
  id: string; name: string; date_start: string; date_end: string;
  weekday_price_cents: number; weekend_price_cents: number; priority: number;
};

const c2d = (c: number) => (c / 100).toFixed(2);
const d2c = (s: string | number) => Math.round(Number(s) * 100);

/* Convención de temporadas: [date_start, date_end) — la fecha fin es la salida
   (no se incluye). Dos rangos [) se solapan si a.start < b.end && b.start < a.end.
   Las fechas son ISO (YYYY-MM-DD), así que comparar como texto es correcto. */
function seasonsOverlapping(start: string, end: string, seasons: Season[], excludeId?: string): Season[] {
  if (!start || !end || start >= end) return [];
  return seasons.filter((s) => s.id !== excludeId && start < s.date_end && s.date_start < end);
}

export function Precios() {
  const [prop, setProp] = useState<Prop | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [nueva, setNueva] = useState({ name: "", date_start: "", date_end: "", weekday: "", weekend: "" });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        api<{ property: Prop }>("/api/admin/property"),
        api<{ seasons: Season[] }>("/api/admin/seasons"),
      ]);
      setProp(p.property);
      setSeasons(s.seasons);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setOk("");
    setErr("");
    try {
      setOk(await fn());
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (err && !prop) return <div className="pn-msg bad">{err}</div>;
  if (!prop) return <p className="pn-muted">Cargando…</p>;

  // temporadas que chocan con las fechas que está escribiendo (aviso en vivo)
  const solapes = seasonsOverlapping(nueva.date_start, nueva.date_end, seasons);

  return (
    <>
      <h2>Precios</h2>
      {ok && <div className="pn-msg ok">{ok}</div>}
      {err && <div className="pn-msg bad">{err}</div>}

      <div className="pn-card">
        <h3>Precio base por noche</h3>
        <p className="pn-muted">
          Se usa cuando la noche no cae en ninguna temporada. Fin de semana = viernes y sábado.
        </p>
        <div className="grid2">
          <label className="f"><span>Entre semana ($)</span>
            <input
              type="number" min={1} step="1" defaultValue={c2d(prop.weekday_price_cents)}
              onChange={(e) => setProp({ ...prop, weekday_price_cents: d2c(e.target.value) })}
            />
          </label>
          <label className="f"><span>Fin de semana ($)</span>
            <input
              type="number" min={1} step="1" defaultValue={c2d(prop.weekend_price_cents)}
              onChange={(e) => setProp({ ...prop, weekend_price_cents: d2c(e.target.value) })}
            />
          </label>
        </div>
        <div className="grid2">
          <label className="f"><span>Huésped extra ($/noche)</span>
            <input
              type="number" min={0} step="1" defaultValue={c2d(prop.extra_guest_price_cents)}
              onChange={(e) => setProp({ ...prop, extra_guest_price_cents: d2c(e.target.value) })}
            />
          </label>
          <label className="f"><span>Huéspedes incluidos</span>
            <input
              type="number" min={1} max={prop.max_guests} defaultValue={prop.included_guests}
              onChange={(e) => setProp({ ...prop, included_guests: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="grid2">
          <label className="f"><span>Mínimo de noches</span>
            <input
              type="number" min={1} defaultValue={prop.min_nights}
              onChange={(e) => setProp({ ...prop, min_nights: Number(e.target.value) })}
            />
          </label>
          <label className="f"><span>Precio por mascota ($/estadía)</span>
            <input
              type="number" min={0} step="1" defaultValue={c2d(prop.pet_price_cents)}
              onChange={(e) => setProp({ ...prop, pet_price_cents: d2c(e.target.value) })}
            />
          </label>
        </div>
        <button
          className="btn ok"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api("/api/admin/property", {
                method: "PATCH",
                body: JSON.stringify({
                  weekday_price_cents: prop.weekday_price_cents,
                  weekend_price_cents: prop.weekend_price_cents,
                  extra_guest_price_cents: prop.extra_guest_price_cents,
                  pet_price_cents: prop.pet_price_cents,
                  included_guests: prop.included_guests,
                  min_nights: prop.min_nights,
                }),
              });
              return "Precios base guardados ✓";
            })
          }
        >
          Guardar precios base
        </button>
      </div>

      <div className="pn-card">
        <h3>Temporadas</h3>
        <p className="pn-muted">
          La fecha fin NO se incluye (es la salida). Si dos temporadas se cruzan, gana la de mayor prioridad.
        </p>
        {seasons.map((s) => (
          <div key={s.id} style={{ borderBottom: "1px solid var(--pborde)", padding: "8px 0" }}>
            <div className="pn-row" style={{ justifyContent: "space-between" }}>
              <b>{s.name}</b>
              <button
                className="btn bad sm"
                disabled={busy}
                onClick={() =>
                  window.confirm(`¿Eliminar la temporada "${s.name}"?`) &&
                  run(async () => {
                    await api(`/api/admin/seasons/${s.id}`, { method: "DELETE" });
                    return "Temporada eliminada ✓";
                  })
                }
              >
                Eliminar
              </button>
            </div>
            <div className="pn-muted">
              {fmtFecha(s.date_start)} → {fmtFecha(s.date_end)} ·{" "}
              {money(s.weekday_price_cents / 100)} semana / {money(s.weekend_price_cents / 100)} finde
            </div>
          </div>
        ))}
        {seasons.length === 0 && <p className="pn-muted">No hay temporadas creadas.</p>}

        <h3 style={{ marginTop: 14 }}>Nueva temporada</h3>
        <label className="f"><span>Nombre (ej. Feriado de Carnaval)</span>
          <input type="text" value={nueva.name} onChange={(e) => setNueva({ ...nueva, name: e.target.value })} />
        </label>
        <div className="grid2">
          <label className="f"><span>Desde</span>
            <input type="date" value={nueva.date_start} onChange={(e) => setNueva({ ...nueva, date_start: e.target.value })} />
          </label>
          <label className="f"><span>Hasta (salida)</span>
            <input type="date" value={nueva.date_end} onChange={(e) => setNueva({ ...nueva, date_end: e.target.value })} />
          </label>
        </div>
        <div className="grid2">
          <label className="f"><span>$ entre semana</span>
            <input type="number" min={1} value={nueva.weekday} onChange={(e) => setNueva({ ...nueva, weekday: e.target.value })} />
          </label>
          <label className="f"><span>$ fin de semana</span>
            <input type="number" min={1} value={nueva.weekend} onChange={(e) => setNueva({ ...nueva, weekend: e.target.value })} />
          </label>
        </div>
        {solapes.length > 0 && (
          <div className="pn-msg warn" role="alert">
            ⚠️ Estas fechas se cruzan con {solapes.length === 1 ? "una temporada" : `${solapes.length} temporadas`}:
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {solapes.map((s) => (
                <li key={s.id}>
                  <b>{s.name}</b> ({fmtFecha(s.date_start)} → {fmtFecha(s.date_end)})
                </li>
              ))}
            </ul>
            <span className="pn-muted" style={{ display: "block", marginTop: 6 }}>
              Puedes crearla igual: en las fechas que chocan gana la temporada de mayor prioridad.
            </span>
          </div>
        )}
        <button
          className="btn dark"
          disabled={busy || !nueva.name || !nueva.date_start || !nueva.date_end || !nueva.weekday || !nueva.weekend}
          onClick={() =>
            run(async () => {
              await api("/api/admin/seasons", {
                method: "POST",
                body: JSON.stringify({
                  name: nueva.name,
                  date_start: nueva.date_start,
                  date_end: nueva.date_end,
                  weekday_price_cents: d2c(nueva.weekday),
                  weekend_price_cents: d2c(nueva.weekend),
                }),
              });
              setNueva({ name: "", date_start: "", date_end: "", weekday: "", weekend: "" });
              return "Temporada creada ✓";
            })
          }
        >
          + Crear temporada
        </button>
      </div>
    </>
  );
}

/* ════════════ Módulo H — DISPONIBILIDAD ════════════ */

type Block = { id: string; source: string; start_date: string; end_date: string; summary: string | null };

export function Disponibilidad() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [nuevo, setNuevo] = useState({ start: "", end: "", summary: "" });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ blocks: Block[] }>("/api/admin/blocks");
      setBlocks(r.blocks);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setOk("");
    setErr("");
    try {
      setOk(await fn());
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>Bloquear fechas</h2>
      {ok && <div className="pn-msg ok">{ok}</div>}
      {err && <div className="pn-msg bad">{err}</div>}
      <p className="pn-muted">
        Bloquea fechas para mantenimiento o uso propio: nadie podrá reservarlas.
        La fecha fin no se bloquea (es el día en que la casa vuelve a estar libre).
      </p>

      <div className="pn-card">
        <h3>Nuevo bloqueo</h3>
        <div className="grid2">
          <label className="f"><span>Desde</span>
            <input type="date" value={nuevo.start} onChange={(e) => setNuevo({ ...nuevo, start: e.target.value })} />
          </label>
          <label className="f"><span>Hasta (libre otra vez)</span>
            <input type="date" value={nuevo.end} onChange={(e) => setNuevo({ ...nuevo, end: e.target.value })} />
          </label>
        </div>
        <label className="f"><span>Motivo (opcional)</span>
          <input type="text" placeholder="Mantenimiento, visita familiar…" value={nuevo.summary} onChange={(e) => setNuevo({ ...nuevo, summary: e.target.value })} />
        </label>
        <button
          className="btn dark"
          disabled={busy || !nuevo.start || !nuevo.end}
          onClick={() =>
            run(async () => {
              await api("/api/admin/blocks", {
                method: "POST",
                body: JSON.stringify({
                  start_date: nuevo.start,
                  end_date: nuevo.end,
                  summary: nuevo.summary || undefined,
                }),
              });
              setNuevo({ start: "", end: "", summary: "" });
              return "Fechas bloqueadas ✓";
            })
          }
        >
          + Bloquear fechas
        </button>
      </div>

      <div className="pn-card">
        <h3>Bloqueos activos</h3>
        {blocks.length === 0 && <p className="pn-muted">No hay bloqueos.</p>}
        {blocks.map((b) => (
          <div key={b.id} className="pn-row" style={{ padding: "8px 0", borderBottom: "1px solid var(--pborde)", justifyContent: "space-between" }}>
            <div>
              <b>{fmtFecha(b.start_date)} → {fmtFecha(b.end_date)}</b>
              <div className="pn-muted">
                {b.summary ?? "Bloqueo"} {b.source !== "manual" && <span className="pn-badge info">importado</span>}
              </div>
            </div>
            {b.source === "manual" && (
              <button
                className="btn bad sm"
                disabled={busy}
                onClick={() =>
                  window.confirm("¿Quitar este bloqueo? Las fechas quedarán reservables.") &&
                  run(async () => {
                    await api(`/api/admin/blocks?id=${b.id}`, { method: "DELETE" });
                    return "Bloqueo eliminado ✓";
                  })
                }
              >
                Quitar
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
