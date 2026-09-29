"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { CATEGORIES, reviewSchema, type CategoryKey } from "@/lib/reviews";
import { firstIssue } from "@/lib/booking-schema";
import { fmtNice } from "@/lib/ui";
import { SITE } from "@/config/site.config";

/* ────────────────────────────────────────────────────────────
   Formulario de reseña estilo Airbnb (Etapa 14): paso a paso —
   1) estrellas grandes para la calificación general,
   2) las 6 categorías con estrellas,
   3) "Cuéntanos cómo fue tu estancia" + nombre a mostrar.
   ──────────────────────────────────────────────────────────── */

function Stars({ value, onPick, size = "md" }: {
  value: number;
  onPick: (v: number) => void;
  size?: "md" | "lg";
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className={`rstars rstars--${size}`} role="radiogroup" aria-label="Calificación">
      {[1, 2, 3, 4, 5].map((v) => (
        <button
          key={v} type="button" role="radio" aria-checked={value === v}
          aria-label={`${v} estrella${v > 1 ? "s" : ""}`}
          className={v <= shown ? "on" : ""}
          onMouseEnter={() => setHover(v)} onMouseLeave={() => setHover(0)}
          onClick={() => onPick(v)}
        >
          <Icon n="star" />
        </button>
      ))}
    </div>
  );
}

const OVERALL_LABELS = ["", "Muy mala", "Mala", "Normal", "Muy buena", "¡Excelente!"];

type Props = {
  token: string;
  suggestedName: string;
  checkIn: string;
  checkOut: string;
};

export function ReviewForm({ token, suggestedName, checkIn, checkOut }: Props) {
  const [step, setStep] = useState(0);          // 0 general · 1 categorías · 2 texto
  const [overall, setOverall] = useState(0);
  const [cats, setCats] = useState<Record<CategoryKey, number>>(
    Object.fromEntries(CATEGORIES.map((c) => [c.key, 0])) as Record<CategoryKey, number>
  );
  const [comment, setComment] = useState("");
  const [name, setName] = useState(suggestedName);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const catsDone = CATEGORIES.every((c) => cats[c.key] > 0);

  const submit = async () => {
    setError(null);
    const payload = {
      token,
      display_name: name,
      rating_overall: overall,
      ...cats,
      comment,
    };
    const checked = reviewSchema.safeParse(payload);
    if (!checked.success) {
      setError(firstIssue(checked.error));
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checked.data),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) { setDone(true); return; } // ya existía
      if (!res.ok) {
        setError(data?.error ?? "No se pudo enviar tu evaluación");
        return;
      }
      setDone(true);
    } catch {
      setError("Error de conexión — inténtalo de nuevo");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="resena-notice">
        <h2>¡Gracias por tu evaluación! 🌿</h2>
        <p>
          Tu opinión nos ayuda a seguir mejorando y a que otras familias
          descubran {SITE.name}. La revisamos y la publicamos muy pronto.
        </p>
      </div>
    );
  }

  return (
    <div className="resena">
      <div className="sec-head center">
        <span className="eyebrow center">Tu estadía del {fmtNice(checkIn)} al {fmtNice(checkOut)}</span>
        <h2>¿Cómo te fue en {SITE.name}?</h2>
      </div>

      {/* paso 1: calificación general, estrellas grandes */}
      {step === 0 && (
        <div className="resena__step">
          <p className="resena__q">Tu calificación general</p>
          <Stars value={overall} onPick={(v) => setOverall(v)} size="lg" />
          <p className="resena__hint">{OVERALL_LABELS[overall] || "Toca una estrella"}</p>
          <button className="btn btn--primary btn--block" disabled={!overall}
            onClick={() => setStep(1)}>
            Continuar
          </button>
        </div>
      )}

      {/* paso 2: categorías */}
      {step === 1 && (
        <div className="resena__step">
          <p className="resena__q">Cuéntanos un poco más</p>
          <div className="resena__cats">
            {CATEGORIES.map((c) => (
              <div className="resena__cat" key={c.key}>
                <span>{c.label}</span>
                <Stars value={cats[c.key]} onPick={(v) => setCats((p) => ({ ...p, [c.key]: v }))} />
              </div>
            ))}
          </div>
          <div className="resena__nav">
            <button className="btn btn--ghost" onClick={() => setStep(0)}>Atrás</button>
            <button className="btn btn--primary" disabled={!catsDone} onClick={() => setStep(2)}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* paso 3: comentario + nombre */}
      {step === 2 && (
        <div className="resena__step">
          <label className="bk-field bk-field--full">
            <span>Cuéntanos cómo fue tu estancia</span>
            <textarea
              rows={5} maxLength={2000}
              placeholder="¿Qué fue lo mejor? ¿Qué recomendarías a otros huéspedes? (mínimo 20 caracteres)"
              value={comment} onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <label className="bk-field bk-field--full">
            <span>Tu nombre a mostrar</span>
            <input type="text" maxLength={60} value={name}
              onChange={(e) => setName(e.target.value)} placeholder="Ej. María J." />
          </label>
          {error && <p className="resena__error">{error}</p>}
          <div className="resena__nav">
            <button className="btn btn--ghost" onClick={() => setStep(1)}>Atrás</button>
            <button className="btn btn--primary" disabled={sending} onClick={submit}>
              {sending ? "Enviando…" : "Enviar evaluación"}
            </button>
          </div>
        </div>
      )}

      <div className="resena__dots" aria-hidden>
        {[0, 1, 2].map((i) => <span key={i} className={i === step ? "on" : ""} />)}
      </div>
    </div>
  );
}
