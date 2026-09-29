"use client";

import Image from "next/image";
import { DORMITORIOS } from "@/lib/site-data";

/* "Dónde vas a dormir" (Etapa 13) — carrusel de cards estilo Airbnb.
   En mobile: scroll-snap horizontal; en desktop caben las 3 a la vista.
   Camas según el addendum del cliente (editar en site-data.ts). */
export function Dormitorios() {
  return (
    <section className="section" id="dormir">
      <div className="wrap">
        <div className="sec-head reveal">
          <span className="eyebrow">Descansa</span>
          <h2>Dónde vas a dormir</h2>
        </div>
        <div className="dorms reveal d1">
          {DORMITORIOS.map((d) => (
            <article className="dorm" key={d.label}>
              <div className="dorm__media">
                <Image
                  src={d.photo} alt={d.label} fill loading="lazy"
                  sizes="(max-width: 720px) 78vw, 31vw"
                  style={{ objectFit: "cover" }}
                />
              </div>
              <h4>{d.label}</h4>
              <p>{d.camas}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
