import Link from "next/link";

/* "Qué debes saber" (Etapa 21) — el home resume en 3 líneas, el
   detalle completo vive en /politicas. Sin acordeones. */
export function KnowBefore() {
  return (
    <section className="section section--alt" id="que-saber">
      <div className="wrap">
        <div className="sec-head reveal">
          <span className="eyebrow">Antes de tu viaje</span>
          <h2>Qué debes saber</h2>
        </div>
        <ul className="know-brief reveal d1">
          <li>Entrada 3:00 p.m. · Salida 11:00 a.m.</li>
          <li>Hasta 8 huéspedes · Pet friendly</li>
          <li>Pago completo para confirmar · Cancelación flexible</li>
        </ul>
        <Link className="know-brief__link reveal d2" href="/politicas">
          Ver políticas y seguridad →
        </Link>
      </div>
    </section>
  );
}
