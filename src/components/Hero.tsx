"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CB, HERO_SLIDES } from "@/lib/site-data";
import { scrollToId } from "@/lib/ui";
import { SITE } from "@/config/site.config";

const SLIDE_MS = 5000;

/* Slider full-bleed del hero: crossfade suave cada ~5s, pausa al hover,
   flechas + dots discretos y swipe en mobile. El overlay de título/CTA
   vive encima y es legible sobre cualquier foto (scrim del CSS). */
function HeroSlider() {
  const [idx, setIdx] = useState(0);
  const paused = useRef(false);
  const touchX = useRef<number | null>(null);

  const go = (n: number) => setIdx((i) => (i + n + HERO_SLIDES.length) % HERO_SLIDES.length);

  useEffect(() => {
    const t = setInterval(() => { if (!paused.current) go(1); }, SLIDE_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="hero__bg hero__slider"
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      {HERO_SLIDES.map((s, i) => (
        <div className={"hero__slide" + (i === idx ? " on" : "")} key={s.src} aria-hidden={i !== idx}>
          <Image
            src={s.src} alt={s.alt} fill priority={i === 0}
            sizes="100vw" style={{ objectFit: "cover" }}
          />
        </div>
      ))}
      <button className="hero__nav hero__nav--prev" aria-label="Foto anterior"
        onClick={() => go(-1)}>‹</button>
      <button className="hero__nav hero__nav--next" aria-label="Siguiente foto"
        onClick={() => go(1)}>›</button>
      <div className="hero__dots" role="tablist" aria-label="Fotos del inicio">
        {HERO_SLIDES.map((s, i) => (
          <button key={s.src} className={i === idx ? "on" : ""} aria-label={`Foto ${i + 1}`}
            onClick={() => setIdx(i)} />
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="hero" id="top">
      <HeroSlider />
      <div className="hero__inner wrap">
        <span className="hero__loc"><Icon n="pin" /> {CB.lugar}</span>
        <div className="hero__mark"><img src="/assets/logo-white.png" alt={`${SITE.name}`} /></div>
        <h1>Donde nacen recuerdos inolvidables</h1>
        <p className="hero__tag">
          Una casa cálida, construida con amor, con espacios pensados para compartir momentos en familia y con amigos.
        </p>
        {/* el buscador se retiró: las fechas se eligen en /reservar
            (paso 1 del wizard — calendario con precios) */}
        <Link className="btn btn--primary btn--lg hero__cta" href="/reservar">
          Reservar ahora
        </Link>
        <div className="hero__trust">
          <span><Icon n="check" /> Reserva directa, sin comisiones</span>
          <span><Icon n="lock" /> Pago seguro</span>
          <span><Icon n="check" /> Cancelación flexible</span>
        </div>
      </div>
      <a className="hero__scroll" href="#alojamiento" onClick={(e) => { e.preventDefault(); scrollToId("alojamiento"); }}>
        <span className="mouse"></span>Descubre
      </a>
    </section>
  );
}
