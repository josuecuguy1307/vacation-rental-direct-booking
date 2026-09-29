"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { AMENITIES, AMENITY_GROUPS, STATS } from "@/lib/site-data";

/* Amenidades (Etapas 2 + 13 + addendum): cards con las ~10 DESTACADAS
   como vista resumida, y el modal "Lo que ofrece este lugar" con el
   listado completo de Airbnb agrupado por categoría (subtextos grises
   y "No incluidos" tachados al final). Contenido en site-data.ts. */
export function Amenities() {
  const [open, setOpen] = useState(false);
  // conteo real desde el config (incluye "No incluidos", como Airbnb)
  const totalItems = AMENITY_GROUPS.reduce((s, g) => s + g.items.length, 0);

  // modal: Esc cierra y bloquea el scroll de fondo
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <section className="section" id="amenidades">
      <div className="wrap">
        <div className="sec-head reveal">
          <span className="eyebrow">Todo incluido</span>
          <h2>Completamente equipada, con privacidad, seguridad y diversión</h2>
          <p className="lead">Describe aquí lo que hace especial tu propiedad (texto de ejemplo).</p>
        </div>
        <div className="amen-stats reveal d1">
          {STATS.map((s, i) => (
            <div className="amen-stat" key={i}><b>{s.n}</b><span>{s.l}</span></div>
          ))}
        </div>
        <div className="amen-grid reveal d1">
          {AMENITIES.map((a, i) => (
            <div className="amen" key={i}>
              <span className="amen__ic"><Icon n={a.ic} /></span>
              <h4>{a.t}</h4>
              <p>{a.d}</p>
            </div>
          ))}
        </div>

        <div className="amen-all reveal d2">
          <button className="btn btn--ghost" onClick={() => setOpen(true)}>
            Mostrar las {totalItems} amenidades
          </button>
        </div>
      </div>

      {/* ── Modal: lo que ofrece este lugar ── */}
      {open && (
        <div className="amen-modal" role="dialog" aria-modal="true"
          aria-label="Lo que ofrece este lugar" onClick={() => setOpen(false)}>
          <div className="amen-modal__card" onClick={(e) => e.stopPropagation()}>
            <button className="amen-modal__close" aria-label="Cerrar" onClick={() => setOpen(false)}>×</button>
            <h3>Lo que ofrece este lugar</h3>
            {AMENITY_GROUPS.map((g) => (
              <div className="amen-modal__group" key={g.cat}>
                <h4>{g.cat}</h4>
                <ul>
                  {g.items.map((it) => (
                    <li key={it.t} className={it.off ? "off" : ""}>
                      <Icon n={it.ic ?? "check"} style={{ width: 18, height: 18 }} />
                      <div>
                        <span className="amen-modal__t">{it.t}</span>
                        {it.sub && <small>{it.sub}</small>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
