const REGLAS = [
  "Llegada a partir de las 3:00 p.m.",
  "Salida antes de las 11:00 a.m.",
  "Máximo de huéspedes según tu reserva.",
  "Consulta la política de mascotas con el anfitrión.",
  "No se admiten fiestas que superen el número de huéspedes de la reserva sin autorización del anfitrión.",
  "No fumar dentro de la casa.",
  "No se permiten armas dentro de la propiedad.",
  "Se permite el consumo de alcohol de forma moderada, siempre que no cause daños dentro ni fuera de la propiedad.",
  "No estacionar sobre el césped natural ni sintético.",
];

const ESTADIA = [
  "Indica aquí los horarios de uso de áreas comunes (piscina, jacuzzi, etc.).",
  "Explica cualquier norma especial de tus instalaciones.",
  "Al usar el aire acondicionado, mantén puertas y ventanas cerradas.",
  "Antes de salir, apaga luces, aire acondicionado y ventiladores.",
  "Deja las toallas usadas en la cesta del baño.",
  "Lleva la basura al basurero ubicado en el exterior de la propiedad.",
];

/* Página de lectura (Etapa 21). No va en el nav — se llega desde el
   link del home y desde el footer. Textos de ejemplo: reemplázalos por tus reglas. */
export function Policies() {
  return (
    <>
      <section className="section policy-section">
        <div className="wrap wrap--narrow">
          <div className="sec-head reveal">
            <span className="eyebrow">Antes de tu viaje</span>
            <h2>Políticas y seguridad</h2>
          </div>
        </div>
      </section>

      <section className="section section--tight policy-section" id="reglas">
        <div className="wrap wrap--narrow">
          <h3 className="policy-h reveal">Reglas de la casa</h3>
          <ul className="policy-list reveal d1">
            {REGLAS.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      </section>

      <section className="section section--tight section--alt policy-section" id="estadia">
        <div className="wrap wrap--narrow">
          <h3 className="policy-h reveal">Durante tu estadía</h3>
          <ul className="policy-list reveal d1">
            {ESTADIA.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      </section>

      <section className="section section--tight policy-section" id="cancelacion">
        <div className="wrap wrap--narrow">
          <h3 className="policy-h reveal">Cancelación y pagos</h3>
          <ul className="policy-list reveal d1">
            <li><b>Cancelación flexible.</b></li>
            <li>Tus fechas quedan apartadas con el <b>pago completo</b> de tu reserva.</li>
            <li>Si necesitas cancelar o mover tu reserva, escríbenos por WhatsApp con anticipación y coordinamos el reembolso según las condiciones.</li>
            <li>Consulta las condiciones con el anfitrión.</li>
          </ul>
        </div>
      </section>

      <section className="section section--tight section--alt policy-section" id="seguridad">
        <div className="wrap wrap--narrow">
          <h3 className="policy-h reveal">Seguridad y propiedad</h3>
          <ul className="policy-list reveal d1">
            <li>La propiedad cuenta con <b>cámaras de seguridad exteriores</b>.</li>
            <li>No hay cámaras en el interior de la casa ni en áreas privadas.</li>
          </ul>
        </div>
      </section>
    </>
  );
}
