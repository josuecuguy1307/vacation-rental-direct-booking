import { ARRIVAL_STEPS } from "@/lib/site-data";

/* Componente propio de /ubicacion: pasos para llegar en auto.
   El texto de cada paso vive en ARRIVAL_STEPS (src/lib/site-data.ts).
   Si quieres una foto por paso, añade un campo `foto` y renderízalo aquí. */
export function ArrivalGuide() {
  return (
    <div className="arrive reveal d3">
      <h3>Cómo llegar</h3>
      <ol className="arrive__steps">
        {ARRIVAL_STEPS.map((paso, i) => (
          <li key={i} className={`arrive__step${i % 2 === 1 ? " is-reverse" : ""}`}>
            <div className="arrive__body">
              <span className="arrive__num">{i + 1}</span>
              <p>{paso}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
