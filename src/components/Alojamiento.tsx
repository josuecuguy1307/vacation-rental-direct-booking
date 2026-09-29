"use client";

import { useState } from "react";
import { ALOJAMIENTO } from "@/lib/site-data";

/* "El alojamiento" (Etapa 13) — copy exacto del cliente con colapso
   "Mostrar más" estilo Airbnb: visible el intro + primer subtítulo,
   el resto se expande. Los textos viven en site-data.ts. */
export function Alojamiento() {
  const [open, setOpen] = useState(false);

  return (
    <section className="section section--alt" id="alojamiento">
      <div className="wrap wrap--narrow">
        <div className="sec-head reveal">
          <span className="eyebrow">El alojamiento</span>
          <h2>{ALOJAMIENTO.titulo}</h2>
        </div>
        <div className="aloja reveal d1">
          <p className="aloja__intro">{ALOJAMIENTO.intro}</p>

          <div className={"aloja__rest" + (open ? " open" : "")}>
            {ALOJAMIENTO.secciones.map((s) => (
              <div className="aloja__bloque" key={s.t}>
                <h3>{s.t}</h3>
                <p>{s.p}</p>
              </div>
            ))}
          </div>

          <button className="aloja__toggle" onClick={() => setOpen((v) => !v)}>
            {open ? "Mostrar menos" : "Mostrar más"} <span aria-hidden>{open ? "▴" : "▾"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
