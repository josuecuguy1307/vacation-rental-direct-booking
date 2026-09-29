"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { TOUR, type TourSpace } from "@/lib/site-data";

/* ────────────────────────────────────────────────────────────
   Recorrido fotográfico (Etapa 13, estilo Airbnb): grid de
   espacios con su línea de detalles " · " bajo el título y
   lightbox con navegación entre espacios. Reemplaza a la
   galería masonry (conserva el ancla #galeria del nav).
   ──────────────────────────────────────────────────────────── */

/** Línea de detalles con truncado + "Mostrar más" expandible. */
function Details({ space, compact }: { space: TourSpace; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!space.details.length) return null;
  const full = space.details.join(" · ");
  // truncado solo cuando la línea es larga (grid: ~3 ítems; lightbox: ~5)
  const limit = compact ? 3 : 5;
  const isLong = space.details.length > limit;
  const text = open || !isLong ? full : space.details.slice(0, limit).join(" · ") + "…";
  return (
    <p className="tour__details">
      {text}{" "}
      {isLong && (
        <button className="tour__more" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
          {open ? "Mostrar menos" : "Mostrar más"}
        </button>
      )}
    </p>
  );
}

export function PhotoTour() {
  const [active, setActive] = useState<number | null>(null);
  const touchX = useRef<number | null>(null);

  const close = useCallback(() => setActive(null), []);
  const go = useCallback((n: number) => {
    setActive((i) => (i === null ? i : (i + n + TOUR.length) % TOUR.length));
  }, []);

  // teclado: Esc cierra, flechas navegan; sin scroll de fondo con el lightbox abierto
  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [active, close, go]);

  const space = active !== null ? TOUR[active] : null;

  return (
    <section className="section" id="galeria">
      <div className="wrap">
        <div className="sec-head reveal">
          <span className="eyebrow">Conoce cada rincón</span>
          <h2>Recorrido fotográfico</h2>
        </div>

        <div className="tour-grid reveal d1">
          {TOUR.map((s, i) => (
            <article className="tour" key={s.slug} onClick={() => setActive(i)}>
              <div className="tour__media">
                <Image
                  src={s.photo} alt={s.label} fill loading="lazy"
                  sizes="(max-width: 720px) 50vw, (max-width: 1100px) 33vw, 25vw"
                  style={{ objectFit: "cover" }}
                />
              </div>
              <h4>{s.label}</h4>
              <Details space={s} compact />
            </article>
          ))}
        </div>
      </div>

      {/* ── Lightbox del espacio ── */}
      {space && (
        <div className="tour-lb" role="dialog" aria-modal="true" aria-label={space.label}
          onClick={close}>
          <button className="tour-lb__close" aria-label="Cerrar" onClick={close}>×</button>
          <button className="tour-lb__nav tour-lb__nav--prev" aria-label="Espacio anterior"
            onClick={(e) => { e.stopPropagation(); go(-1); }}>‹</button>
          <figure
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (touchX.current === null) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
              touchX.current = null;
            }}
          >
            {/* foto a tamaño natural del espacio (AVIF ya optimizado) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={space.photo} alt={space.label} />
            <figcaption>
              <b>{space.label}</b>
              <span className="tour-lb__count">{(active ?? 0) + 1} / {TOUR.length}</span>
              <Details space={space} />
            </figcaption>
          </figure>
          <button className="tour-lb__nav tour-lb__nav--next" aria-label="Siguiente espacio"
            onClick={(e) => { e.stopPropagation(); go(1); }}>›</button>
        </div>
      )}
    </section>
  );
}
