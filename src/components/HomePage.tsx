"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Alojamiento } from "@/components/Alojamiento";
import { Reviews } from "@/components/Reviews";
import { Footer, WhatsAppFloat } from "@/components/Footer";
import { RevealObserver } from "@/components/RevealObserver";

/* Home liviano (cada sección grande vive en su propia pantalla):
   hero → el alojamiento → reseñas → CTA a /reservar.
   Historia/amenidades → /la-casa · recorrido → /galeria · mapa → /ubicacion. */
export function HomePage() {
  // compat: los links viejos de pago llegaban a /?pago=... — ahora esa
  // banda vive en /reservar
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("pago")) {
      window.location.replace("/reservar" + window.location.search);
    }
  }, []);

  return (
    <div>
      <Header />
      <RevealObserver />
      <Hero />
      <Alojamiento />
      <Reviews />

      {/* banda CTA: la reserva está en su propia pantalla */}
      <section className="section">
        <div className="wrap">
          <div className="snack-note reveal">
            <div className="snack-note__txt">
              <p>
                <b>¿Listo para tu escapada?</b> Elige tus fechas en el calendario
                y confirma con el pago completo — toma menos de dos minutos.
              </p>
            </div>
            <Link className="btn btn--primary" href="/reservar">Reservar ahora</Link>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
