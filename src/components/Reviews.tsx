"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { CATEGORIES, type ReviewStats } from "@/lib/reviews";

/* ────────────────────────────────────────────────────────────
   Reseñas del home (Etapa 14, estilo Airbnb): encabezado con el
   promedio grande (★ 4.9 · 12 evaluaciones) + barras por
   categoría, grid de cards y modal "Mostrar todas". Solo
   published (GET /api/reviews); sin reseñas, la sección NO se
   renderiza — nada de placeholders vacíos.
   ──────────────────────────────────────────────────────────── */

type ApiReview = {
  id: string;
  name: string;
  rating_overall: number;
  comment: string | null;
  date: string;
};

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso + "T12:00:00")) / 86_400_000);
  if (days < 7) return "esta semana";
  if (days < 30) return `hace ${Math.max(1, Math.floor(days / 7))} semana${days >= 14 ? "s" : ""}`;
  if (days < 365) {
    const m = Math.floor(days / 30);
    return m <= 1 ? "hace 1 mes" : `hace ${m} meses`;
  }
  const d = new Date(iso + "T12:00:00");
  return `${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;
}

function ReviewCard({ r }: { r: ApiReview }) {
  const [open, setOpen] = useState(false);
  const text = r.comment ?? "";
  const long = text.length > 180;
  return (
    <figure className="review">
      <div className="review__top">
        <span className="review__av">{r.name.charAt(0).toUpperCase()}</span>
        <span><b>{r.name}</b><small>{relativeDate(r.date)}</small></span>
      </div>
      <div className="stars stars--sm">
        {Array.from({ length: r.rating_overall }).map((_, k) => <Icon n="star" key={k} />)}
      </div>
      <p>
        “{open || !long ? text : text.slice(0, 180).trimEnd() + "…"}”{" "}
        {long && (
          <button className="review__more" onClick={() => setOpen((v) => !v)}>
            {open ? "Mostrar menos" : "Mostrar más"}
          </button>
        )}
      </p>
    </figure>
  );
}

export function Reviews() {
  const [data, setData] = useState<{ stats: ReviewStats; reviews: ApiReview[] } | null>(null);
  const [modal, setModal] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/reviews");
        if (!res.ok) return;
        const d = await res.json();
        if (alive && d?.reviews?.length) setData(d);
      } catch { /* sin reseñas: la sección no se pinta */ }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setModal(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [modal]);

  // sin reseñas publicadas → no se renderiza nada
  if (!data) return null;
  const { stats, reviews } = data;
  const visible = reviews.slice(0, 6);

  return (
    <section className="section cream" id="resenas">
      <div className="wrap">
        <div className="rev-head reveal in">
          <div className="rev-head__big">
            <Icon n="star" />
            <b>{stats.avg_overall.toFixed(1)}</b>
            <span>· {stats.count} evaluaci{stats.count === 1 ? "ón" : "ones"}</span>
          </div>
          <div className="rev-head__cats">
            {CATEGORIES.map(({ key, label }) => {
              const v = stats.categories[key];
              if (v === null) return null;
              return (
                <div className="rev-cat" key={key}>
                  <span>{label}</span>
                  <div className="rev-cat__bar"><i style={{ width: `${(v / 5) * 100}%` }} /></div>
                  <b>{v.toFixed(1)}</b>
                </div>
              );
            })}
          </div>
        </div>

        <div className="reviews-grid">
          {visible.map((r) => <ReviewCard r={r} key={r.id} />)}
        </div>

        {reviews.length > 6 && (
          <div className="rev-all">
            <button className="btn btn--ghost" onClick={() => setModal(true)}>
              Mostrar todas las evaluaciones ({reviews.length})
            </button>
          </div>
        )}
      </div>

      {modal && (
        <div className="amen-modal" role="dialog" aria-modal="true"
          aria-label="Todas las evaluaciones" onClick={() => setModal(false)}>
          <div className="amen-modal__card" onClick={(e) => e.stopPropagation()}>
            <button className="amen-modal__close" aria-label="Cerrar" onClick={() => setModal(false)}>×</button>
            <h3>★ {stats.avg_overall.toFixed(1)} · {stats.count} evaluaciones</h3>
            <div className="rev-modal__list">
              {reviews.map((r) => <ReviewCard r={r} key={r.id} />)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
