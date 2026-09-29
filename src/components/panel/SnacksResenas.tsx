"use client";

import { useCallback, useEffect, useState } from "react";
import { api, getSess, money } from "./api";

/* Módulo I — SNACKS: CRUD de la carta (precios, activar/desactivar, crear).
   Módulo J — RESEÑAS: moderación (pendientes → publicar/rechazar). */

type Addon = {
  id: string; name: string; description: string | null;
  price: number; type: string; active: boolean; image_url: string | null;
};

export function SnacksMod() {
  const [addons, setAddons] = useState<Addon[]>([]);
  const [nuevo, setNuevo] = useState({ name: "", price: "", description: "" });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ addons: Addon[] }>("/api/admin/addons");
      setAddons(r.addons);
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

  const uploadFoto = async (a: Addon, file: File) => {
    const s = getSess();
    if (!s) { setErr("Sesión expirada — vuelve a entrar"); return; }
    setBusy(true); setOk(""); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/admin/addons/${a.id}/image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${s.access_token}` },
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setOk(`Foto de "${a.name}" actualizada ✓`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>Snacks y extras</h2>
      {ok && <div className="pn-msg ok">{ok}</div>}
      {err && <div className="pn-msg bad">{err}</div>}

      <div className="pn-card">
        <h3>Carta actual</h3>
        {addons.map((a) => (
          <div key={a.id} style={{ borderBottom: "1px solid var(--pborde)", padding: "10px 0", opacity: a.active ? 1 : 0.55 }}>
            <div className="pn-row" style={{ gap: 10, alignItems: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: 8, overflow: "hidden", flex: "0 0 auto", background: "#efe9dc", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {a.image_url
                  ? <img src={a.image_url} alt={a.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span aria-hidden style={{ fontSize: "1.25rem", opacity: 0.55 }}>🍽️</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pn-row" style={{ justifyContent: "space-between" }}>
                  <b>{a.name}</b>
                  <b>{money(a.price)}</b>
                </div>
                {a.description && <div className="pn-muted">{a.description}</div>}
              </div>
            </div>
            <div className="pn-row" style={{ marginTop: 8, flexWrap: "wrap" }}>
              <button
                className={`btn sm ${a.active ? "plain" : "ok"}`}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api(`/api/admin/addons/${a.id}`, {
                      method: "PATCH", body: JSON.stringify({ active: !a.active }),
                    });
                    return a.active ? `"${a.name}" oculto de la carta.` : `"${a.name}" visible en la carta ✓`;
                  })
                }
              >
                {a.active ? "Ocultar" : "Mostrar"}
              </button>
              <button
                className="btn sm plain"
                disabled={busy}
                onClick={() => {
                  const p = window.prompt(`Nuevo precio de "${a.name}" ($):`, a.price.toFixed(2));
                  if (p === null) return;
                  const num = Number(p);
                  if (!Number.isFinite(num) || num < 0) {
                    setErr("Precio inválido");
                    return;
                  }
                  run(async () => {
                    await api(`/api/admin/addons/${a.id}`, {
                      method: "PATCH", body: JSON.stringify({ price: num }),
                    });
                    return `Precio de "${a.name}" actualizado a ${money(num)} ✓`;
                  });
                }}
              >
                Cambiar precio
              </button>
              <label className="btn sm plain" style={{ cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
                {a.image_url ? "Cambiar foto" : "Agregar foto"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: "none" }}
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.currentTarget.value = "";
                    if (f) uploadFoto(a, f);
                  }}
                />
              </label>
              <button
                className="btn sm bad"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`¿Eliminar "${a.name}" de la carta? Se quita para siempre (distinto de ocultar).`)) return;
                  run(async () => {
                    const r = await api<{ ok: boolean; soft_deleted: boolean }>(
                      `/api/admin/addons/${a.id}`, { method: "DELETE" }
                    );
                    return r.soft_deleted
                      ? `"${a.name}" tenía pedidos anteriores: se ocultó de la carta para no dañar tu historial.`
                      : `"${a.name}" eliminado de la carta.`;
                  });
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {addons.length === 0 && <p className="pn-muted">La carta está vacía.</p>}
      </div>

      <div className="pn-card">
        <h3>Nuevo producto</h3>
        <label className="f"><span>Nombre</span>
          <input type="text" value={nuevo.name} onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })} />
        </label>
        <div className="grid2">
          <label className="f"><span>Precio ($)</span>
            <input type="number" min={0} step="0.01" value={nuevo.price} onChange={(e) => setNuevo({ ...nuevo, price: e.target.value })} />
          </label>
          <label className="f"><span>Descripción (opcional)</span>
            <input type="text" value={nuevo.description} onChange={(e) => setNuevo({ ...nuevo, description: e.target.value })} />
          </label>
        </div>
        <button
          className="btn dark"
          disabled={busy || !nuevo.name || nuevo.price === ""}
          onClick={() =>
            run(async () => {
              await api("/api/admin/addons", {
                method: "POST",
                body: JSON.stringify({
                  name: nuevo.name,
                  price: Number(nuevo.price),
                  description: nuevo.description || undefined,
                  type: "per_stay",
                  active: true,
                }),
              });
              setNuevo({ name: "", price: "", description: "" });
              return "Producto creado ✓";
            })
          }
        >
          + Agregar a la carta
        </button>
      </div>
    </>
  );
}

/* ════════════ Módulo J — RESEÑAS ════════════ */

type Review = {
  id: string; display_name: string | null; guest_name?: string | null;
  rating_overall: number | null; comment: string | null;
  status: string; created_at: string;
  limpieza: number | null; veracidad: number | null; llegada: number | null;
  comunicacion: number | null; ubicacion: number | null; calidad_precio: number | null;
};

const estrellas = (n: number | null) => (n ? "★".repeat(n) + "☆".repeat(5 - n) : "—");

export function Resenas() {
  const [vista, setVista] = useState<"pending" | "published" | "rejected">("pending");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ reviews: Review[] }>(`/api/admin/reviews?status=${vista}`);
      setReviews(r.reviews);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [vista]);

  useEffect(() => {
    load();
  }, [load]);

  const moderar = async (r: Review, action: "approve" | "reject") => {
    setBusy(true);
    setOk("");
    setErr("");
    try {
      await api(`/api/admin/reviews/${r.id}`, {
        method: "PATCH", body: JSON.stringify({ action }),
      });
      setOk(action === "approve" ? "Reseña publicada en la web ✓" : "Reseña rechazada (no se publica).");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>Reseñas</h2>
      {ok && <div className="pn-msg ok">{ok}</div>}
      {err && <div className="pn-msg bad">{err}</div>}

      <div className="pn-row" style={{ marginBottom: 10 }}>
        {([
          ["pending", "Por moderar"],
          ["published", "Publicadas"],
          ["rejected", "Rechazadas"],
        ] as const).map(([id, label]) => (
          <button key={id} className={`btn sm ${vista === id ? "dark" : "plain"}`} onClick={() => setVista(id)}>
            {label}
          </button>
        ))}
      </div>

      {reviews.length === 0 && <p className="pn-muted">No hay reseñas aquí.</p>}
      {reviews.map((r) => (
        <div key={r.id} className="pn-card">
          <div className="pn-row" style={{ justifyContent: "space-between" }}>
            <b>{r.display_name ?? r.guest_name ?? "Huésped"}</b>
            <span style={{ color: "var(--pwarn)", fontSize: "1.05rem" }}>{estrellas(r.rating_overall)}</span>
          </div>
          {r.comment && <p style={{ margin: "8px 0" }}>“{r.comment}”</p>}
          <p className="pn-muted" style={{ fontSize: ".8rem" }}>
            Limpieza {r.limpieza ?? "—"} · Veracidad {r.veracidad ?? "—"} · Llegada {r.llegada ?? "—"} ·
            Comunicación {r.comunicacion ?? "—"} · Ubicación {r.ubicacion ?? "—"} · Calidad-precio {r.calidad_precio ?? "—"}
          </p>
          {vista === "pending" ? (
            <div className="pn-row">
              <button className="btn ok" style={{ flex: 2 }} disabled={busy} onClick={() => moderar(r, "approve")}>
                ✓ Publicar
              </button>
              <button className="btn bad" style={{ flex: 1 }} disabled={busy} onClick={() => moderar(r, "reject")}>
                ✗ Rechazar
              </button>
            </div>
          ) : (
            <button
              className="btn plain sm"
              disabled={busy}
              onClick={() => moderar(r, vista === "published" ? "reject" : "approve")}
            >
              {vista === "published" ? "Despublicar" : "Publicar"}
            </button>
          )}
        </div>
      ))}
    </>
  );
}
