"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, codigo, estadoInfo, estadoTri, fmtFecha, hoyEc, money, type EstadoTri, type Reserva } from "./api";
import { Disponibilidad } from "./PreciosFechas";
import CalendarioReservas from "./CalendarioReservas";
import ReservaDetalle from "./ReservaDetalle";
import { SITE } from "@/config/site.config";

/* Módulo B — RESERVAS. Vista de CALENDARIO (ocupación mensual) + lista del
   mes con filtros por los TRES estados de cara a la dueña (activa/pagada/
   cancelada). Tocar una reserva abre su detalle completo. Mobile-first.
   Sub-vista "Bloquear fechas" sin cambios (Disponibilidad). */

const pad = (n: number) => String(n).padStart(2, "0");

const CHIPS: { id: "" | EstadoTri; label: string }[] = [
  { id: "", label: "Todas" },
  { id: "activa", label: "Activas" },
  { id: "pagada", label: "Pagadas" },
  { id: "cancelada", label: "Canceladas" },
];

function SubNav({ v, set }: { v: "reservas" | "bloqueos"; set: (x: "reservas" | "bloqueos") => void }) {
  return (
    <div className="pn-subnav">
      <button className={v === "reservas" ? "on" : ""} onClick={() => set("reservas")}>📒 Reservas</button>
      <button className={v === "bloqueos" ? "on" : ""} onClick={() => set("bloqueos")}>📅 Bloquear fechas</button>
    </div>
  );
}

function Fila({ r, e, onOpen, muted }: { r: Reserva; e: EstadoTri; onOpen: () => void; muted?: boolean }) {
  const info = estadoInfo(e);
  return (
    <button className={`pn-item${muted ? " pn-item-muted" : ""}`} onClick={onOpen}>
      <div className="pn-row" style={{ justifyContent: "space-between" }}>
        <b>{r.guest_name}</b>
        <span className={`pn-badge ${info.tone}`}>{info.texto}</span>
      </div>
      <div className="pn-muted">
        {codigo(r.id)} · {fmtFecha(r.check_in)} → {fmtFecha(r.check_out)} · {money(r.total)}
      </div>
    </button>
  );
}

export default function Reservas() {
  const [subview, setSubview] = useState<"reservas" | "bloqueos">("reservas");
  const [filtro, setFiltro] = useState<"" | EstadoTri>("");
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<Reserva[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const hoy = hoyEc();
  const [ym, setYm] = useState(() => {
    const [y, m] = hoy.split("-").map(Number);
    return { y, m: m - 1 }; // month 0–11
  });

  const load = useCallback(async () => {
    try {
      const r = await api<{ reservations: Reserva[] }>(`/api/admin/reservations?limit=200`);
      setLista(r.reservations);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const prevM = () => setYm(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }));
  const nextM = () => setYm(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }));

  // ── qué reservas se listan bajo el calendario ──
  const { mostrados, pendientes } = useMemo(() => {
    const monthStart = `${ym.y}-${pad(ym.m + 1)}-01`;
    const nm = ym.m === 11 ? { y: ym.y + 1, m: 0 } : { y: ym.y, m: ym.m + 1 };
    const monthEndExcl = `${nm.y}-${pad(nm.m + 1)}-01`;
    const overlapMes = (r: Reserva) => r.check_in < monthEndExcl && r.check_out > monthStart;

    const needle = q.trim().toLowerCase();
    const base = needle
      ? lista.filter(
          (r) => r.guest_name.toLowerCase().includes(needle) || r.guest_email.toLowerCase().includes(needle)
        )
      : lista.filter(overlapMes);

    const conEstado = base.map((r) => ({ r, e: estadoTri(r, hoy) }));
    const mostrados = conEstado
      .filter((x) => (filtro ? x.e === filtro : x.e !== "pendiente"))
      .sort((a, b) => (a.r.check_in < b.r.check_in ? -1 : 1));
    // "sin confirmar" (esperando pago): solo en Todas y sin búsqueda, discretas
    const pendientes = !filtro && !needle ? conEstado.filter((x) => x.e === "pendiente") : [];
    return { mostrados, pendientes };
  }, [lista, ym, filtro, q, hoy]);

  // ── detalle ──
  if (selId) {
    return <ReservaDetalle id={selId} onBack={() => setSelId(null)} onChanged={load} />;
  }

  // ── bloquear fechas ──
  if (subview === "bloqueos") {
    return (
      <>
        <SubNav v={subview} set={setSubview} />
        <Disponibilidad />
      </>
    );
  }

  const mesTitulo = new Date(ym.y, ym.m, 1).toLocaleDateString(SITE.locale, { month: "long", year: "numeric" });

  // ── lista + calendario ──
  return (
    <>
      <SubNav v={subview} set={setSubview} />
      <h2>Reservas</h2>
      {err && <div className="pn-msg bad">{err}</div>}

      <CalendarioReservas
        reservas={lista}
        year={ym.y}
        month={ym.m}
        hoy={hoy}
        onPrev={prevM}
        onNext={nextM}
        onSelect={(id) => setSelId(id)}
      />

      <div className="pn-chips">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            className={`btn sm ${filtro === c.id ? "dark" : "plain"}`}
            onClick={() => setFiltro(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre o correo…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {!q.trim() && (
        <p className="pn-muted" style={{ margin: "0 0 8px", textTransform: "capitalize" }}>
          {mesTitulo}
        </p>
      )}

      {mostrados.length === 0 && pendientes.length === 0 && (
        <p className="pn-muted">{q.trim() ? "Sin resultados." : "No hay reservas en este mes."}</p>
      )}

      {mostrados.map(({ r, e }) => (
        <Fila key={r.id} r={r} e={e} onOpen={() => setSelId(r.id)} />
      ))}

      {pendientes.length > 0 && (
        <>
          <p className="pn-muted" style={{ margin: "12px 0 6px" }}>
            Sin confirmar ({pendientes.length}) · aún no pagan, no ocupan el calendario
          </p>
          {pendientes.map(({ r, e }) => (
            <Fila key={r.id} r={r} e={e} onOpen={() => setSelId(r.id)} muted />
          ))}
        </>
      )}
    </>
  );
}
