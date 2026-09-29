"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { CB } from "@/lib/site-data";
import { useContact, waHref } from "@/components/ContactContext";
import { useSnacksCatalog, type SnackAddon } from "@/lib/cajita";
import { SITE } from "@/config/site.config";

/* ────────────────────────────────────────────────────────────
   /snacks (Etapa 21) — CUENTA acumulada por reserva.
   El huésped entra con SU link (/snacks?t=<token>, llega en el
   mensaje "antes de la llegada"); el token dice de qué reserva es
   y el servidor exige que esté activa hoy. Agrega snacks a su
   cuenta y se acumulan; la dueña liquida el total al final por
   transferencia desde el panel. Ya NO se cobra con tarjeta aquí.
   Sin link (p.ej. el QR impreso) la página explica dónde está.
   ──────────────────────────────────────────────────────────── */

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type TabItem = { nombre: string; precio_unit_cents: number; cantidad: number };
type ActiveState =
  | { active: false; reason?: "link" | "inactive" }
  | { active: true; guest_first_name: string; tab: { items: TabItem[]; total_cents: number } };

export function SnacksPage({ token }: { token: string | null }) {
  const snacks = useSnacksCatalog();
  const c = useContact();
  const [state, setState] = useState<ActiveState | null>(null); // null = cargando
  const [cart, setCart] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const loadActive = async () => {
    try {
      const res = await fetch("/api/snacks/active", {
        headers: token ? { "x-snack-token": token } : {},
      });
      setState((await res.json()) as ActiveState);
    } catch {
      setState({ active: false });
    }
  };

  useEffect(() => { loadActive(); }, []);

  const add = (s: SnackAddon, d: number) =>
    setCart((c) => {
      const q = Math.max(0, Math.min(20, (c[s.id] ?? 0) + d));
      const next = { ...c, [s.id]: q };
      if (q === 0) delete next[s.id];
      return next;
    });

  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const fromDb = snacks !== null && snacks.length > 0;
  const cartCents = fromDb
    ? snacks.reduce((sum, s) => sum + Math.round(Number(s.price) * 100) * (cart[s.id] ?? 0), 0)
    : 0;

  const agregar = async () => {
    if (adding || count === 0) return;
    setAdding(true); setError(null); setOkMsg(null);
    try {
      const res = await fetch("/api/snacks/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "x-snack-token": token } : {}) },
        body: JSON.stringify({
          items: Object.entries(cart).map(([addon_id, cantidad]) => ({ addon_id, cantidad })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "No se pudo agregar a tu cuenta");
        if (res.status === 409) await loadActive(); // dejó de haber reserva activa
        return;
      }
      setCart({});
      setOkMsg("¡Agregado a tu cuenta! 🎉");
      setState((prev) => (prev && prev.active ? { ...prev, tab: data.tab } : prev));
    } catch {
      setError("Error de conexión — inténtalo de nuevo");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="snacks-page">
      <div className="snacks-top">
        <img src="/assets/logo-white.png" alt={`${SITE.name}`} />
        <span>{CB.lugar}</span>
      </div>

      <section className="section">
        <div className="wrap">
          {state === null && <p className="lead center">Cargando…</p>}

          {state && !state.active && (
            <div className="sec-head center">
              <span className="eyebrow center">Snacks y antojos</span>
              <h2>
                {state.reason === "link"
                  ? "Abre la carta desde tu link de snacks"
                  : "Tu estadía no está activa en este momento"}
              </h2>
              <p className="lead">
                {state.reason === "link"
                  ? "Te lo enviamos por WhatsApp y correo el día antes de tu llegada. "
                  : "Esta carta se activa durante tu estadía. "}
                Si ya estás hospedado y ves esto,{" "}
                <a href={waHref(c.whatsapp, `Hola, estoy hospedado en ${SITE.name} y quiero pedir snacks`)} target="_blank" rel="noopener">
                  escríbenos por WhatsApp
                </a>{" "}
                y lo revisamos.
              </p>
            </div>
          )}

          {state && state.active && (
            <>
              <div className="sec-head center">
                <span className="eyebrow center">En la casa</span>
                <h2>Hola, {state.guest_first_name || "huésped"} 👋</h2>
                <p className="lead">
                  Arma tu antojo con +/− y agrégalo a tu cuenta. Todo se suma y se
                  paga al final de tu estadía.
                </p>
              </div>

              {okMsg && <div className="sn-banner sn-banner--ok">{okMsg}</div>}
              {error && <p className="sn-error">{error}</p>}

              <div className="snack-grid">
                {fromDb ? (
                  snacks.map((s) => {
                    const qty = cart[s.id] ?? 0;
                    return (
                      <div className={"snack" + (qty > 0 ? " snack--on" : "")} key={s.id}>
                        <div className="snack__media">
                          {s.image_url
                            ? <img src={s.image_url} alt={s.name} loading="lazy" />
                            : <span className="snack__ph"><Icon n="cart" /></span>}
                        </div>
                        <div className="snack__info">
                          <b>{s.name}</b>
                          <span className="snack__price">${Number(s.price).toFixed(2)}</span>
                        </div>
                        <div className="snack__buy">
                          {qty === 0 ? (
                            <button className="snack__add" onClick={() => add(s, +1)}>+ Agregar</button>
                          ) : (
                            <div className="snack__stepper">
                              <button onClick={() => add(s, -1)} aria-label={"Menos " + s.name}>−</button>
                              <span>{qty}</span>
                              <button onClick={() => add(s, +1)} aria-label={"Más " + s.name}>+</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="pn-muted center">Cargando la carta…</p>
                )}
              </div>

              {state.tab.items.length > 0 && (
                <div style={{ maxWidth: 460, margin: "20px auto 0", background: "var(--crema)", borderRadius: 14, padding: "16px 18px" }}>
                  <h3 style={{ margin: "0 0 10px", fontFamily: "var(--serif)" }}>Tu cuenta</h3>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {state.tab.items.map((it, i) => (
                      <li key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: ".95rem" }}>
                        <span>{it.nombre} ×{it.cantidad}</span>
                        <span>{fmt(it.precio_unit_cents * it.cantidad)}</span>
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(46,58,46,.18)", marginTop: 8, paddingTop: 10, fontWeight: 700 }}>
                    <span>Total acumulado</span><span>{fmt(state.tab.total_cents)}</span>
                  </div>
                  <p style={{ margin: "10px 0 0", fontSize: ".82rem", opacity: 0.7 }}>Se paga al final de tu estadía. ¡Disfruta! 🌿</p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {state && state.active && count > 0 && (
        <div className="sn-bar">
          <div className="sn-bar__info">
            <b>{count} snack{count > 1 ? "s" : ""}</b>
            <span>{fmt(cartCents)}</span>
          </div>
          <button className="btn btn--primary sn-bar__pay" disabled={adding} onClick={agregar}>
            {adding ? "Agregando…" : "Agregar a mi cuenta"}
          </button>
        </div>
      )}

      <footer className="snacks-foot">
        <span>{CB.nombre} · {CB.lugar}</span>
      </footer>
    </div>
  );
}
