"use client";

import { useCallback, useEffect, useState } from "react";
import { getSess, setSess, type Sess } from "./api";
import Inicio from "./Inicio";
import Reservas from "./Reservas";
import Caja from "./Caja";
import Ajustes from "./Ajustes";
import { Resenas } from "./SnacksResenas";
import { SITE } from "@/config/site.config";

/* Shell del panel — 4 puertas por intención (nivel superior), con barra
   inferior fija. Lo diario vive en la primera pantalla (Inicio); toda la
   configuración vive detrás de una sola puerta (Ajustes). Reseñas no es
   una puerta: se abre desde el aviso de Inicio (baja frecuencia). */

const VIEWS = ["inicio", "reservas", "caja", "ajustes", "resenas"] as const;
type View = (typeof VIEWS)[number];

const NAV: { id: Exclude<View, "resenas">; ico: string; label: string }[] = [
  { id: "inicio", ico: "🏠", label: "Inicio" },
  { id: "reservas", ico: "📒", label: "Reservas" },
  { id: "caja", ico: "💵", label: "Caja" },
  { id: "ajustes", ico: "🌐", label: "Mi página" },
];

export default function PanelApp() {
  const [sess, setSessState] = useState<Sess | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("inicio");

  useEffect(() => {
    setSessState(getSess());
    setReady(true);
    const h = (window.location.hash.replace("#", "") || "inicio") as View;
    if (VIEWS.includes(h)) setView(h);
    const onLogout = () => setSessState(null);
    window.addEventListener("cb-panel-logout", onLogout);
    return () => window.removeEventListener("cb-panel-logout", onLogout);
  }, []);

  const go = useCallback((v: View) => {
    setView(v);
    window.location.hash = v;
    window.scrollTo({ top: 0 });
  }, []);

  if (!ready) return <div className="pn" />;
  if (!sess) return <Login onOk={(s) => setSessState(s)} />;

  // reseñas cuelga de Inicio: resalta Inicio en la barra
  const active = view === "resenas" ? "inicio" : view;

  return (
    <div className="pn">
      <header className="pn-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logos/logo-crema.png" alt={`${SITE.name}`} />
        <div className="pn-who">
          {sess.email}
          <br />
          <button
            onClick={() => {
              setSess(null);
              setSessState(null);
            }}
          >
            Salir
          </button>
        </div>
      </header>

      <main className="pn-main">
        {view === "inicio" && (
          <Inicio
            onVerReservas={() => go("reservas")}
            onVerCaja={() => go("caja")}
            onVerResenas={() => go("resenas")}
          />
        )}
        {view === "reservas" && <Reservas />}
        {view === "caja" && <Caja />}
        {view === "ajustes" && <Ajustes />}
        {view === "resenas" && (
          <>
            <button className="pn-back" onClick={() => go("inicio")}>← Inicio</button>
            <Resenas />
          </>
        )}
      </main>

      <nav className="pn-bottomnav">
        {NAV.map((n) => (
          <button key={n.id} className={active === n.id ? "on" : ""} onClick={() => go(n.id)}>
            <span className="ico">{n.ico}</span>
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Login({ onOk }: { onOk: (s: Sess) => void }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/panel/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo entrar");
      const s: Sess = {
        access_token: data.access_token,
        expires_at: data.expires_at,
        email: data.email,
      };
      setSess(s);
      onOk(s);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pn">
      <div className="pn-login">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logos/logo-crema.png" alt={`${SITE.name}`} />
        <h1>Panel de gestión</h1>
        <form onSubmit={submit}>
          <input
            type="email"
            placeholder="Correo"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
          <div className="pn-err">{err}</div>
        </form>
      </div>
    </div>
  );
}
