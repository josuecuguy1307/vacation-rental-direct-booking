"use client";

import { useEffect } from "react";

/* Animación de entrada al hacer scroll (.reveal → .in). Cada página lo
   monta una vez; observa también elementos agregados después del mount
   (secciones que cargan datos, p.ej. reseñas). */
export function RevealObserver() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    const observeAll = () =>
      document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
    observeAll();
    // contenido que aparece después (fetch client-side)
    const mo = new MutationObserver(observeAll);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, []);
  return null;
}
