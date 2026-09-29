"use client";

import { useEffect, useState } from "react";
import { Precios } from "./PreciosFechas";
import { SnacksMod } from "./SnacksResenas";
import { LaCasa, Banco, Notificaciones } from "./Config";
import { MensajesAjustes } from "./MensajesTimeline";

/* "Editar mi página de reservas" — la puerta de configuración (antes "Ajustes").
   Todo lo que Carmen controla de su web y de sus reservas vive aquí, en dos
   grupos claros: lo que cambia seguido arriba, lo de-una-vez abajo.

   Layout: en el celular es drill-down (lista → una sección → volver). En
   pantalla ancha es doble panel — lista fija a la izquierda + la sección
   abierta a la derecha ocupando el ancho — en vez de una columna angosta. */

type SecId = "precios" | "snacks" | "mensajes" | "casa" | "banco" | "notif";

const GRUPOS: {
  titulo: string;
  items: { id: SecId; ico: string; label: string; desc: string }[];
}[] = [
  {
    titulo: "Lo que cambias seguido",
    items: [
      { id: "precios",  ico: "🏷️", label: "Precios y temporadas", desc: "Base, huésped extra, mascota, temporadas" },
      { id: "snacks",   ico: "🍫", label: "Carta de snacks",      desc: "Productos, precios y fotos" },
      { id: "mensajes", ico: "✉️", label: "Mensajes automáticos", desc: "Textos y cuándo se envían solos" },
    ],
  },
  {
    titulo: "Se configura una vez",
    items: [
      { id: "casa",  ico: "🏡", label: "La casa",        desc: "Wifi, horarios, limpieza, anticipo" },
      { id: "banco", ico: "🏦", label: "Cuenta bancaria", desc: "Datos para transferencias" },
      { id: "notif", ico: "🔔", label: "Notificaciones",  desc: "A qué correo y qué avisos recibes" },
    ],
  },
];

const TODAS = GRUPOS.flatMap((g) => g.items);

function Seccion({ id }: { id: SecId }) {
  switch (id) {
    case "precios":  return <Precios />;
    case "snacks":   return <SnacksMod />;
    case "mensajes": return <MensajesAjustes />;
    case "casa":     return <LaCasa />;
    case "banco":    return <Banco />;
    case "notif":    return <Notificaciones />;
  }
}

export default function Ajustes() {
  const [sec, setSec] = useState<SecId | null>(null);

  // En pantalla ancha el panel doble no debe arrancar con la derecha vacía:
  // abrimos la primera sección. En el celular arranca en la lista (drill-down).
  useEffect(() => {
    if (window.matchMedia("(min-width: 900px)").matches) {
      setSec((s) => s ?? "precios");
    }
  }, []);

  const abierta = sec ? TODAS.find((i) => i.id === sec) ?? null : null;

  return (
    <div className="mp-shell" data-open={abierta ? "1" : "0"}>
      <nav className="mp-rail" aria-label="Secciones de mi página">
        <h2>Editar mi página</h2>
        <p className="pn-muted mp-rail-sub">
          Todo lo que ve tu huésped y cómo funcionan tus reservas.
        </p>
        {GRUPOS.map((g) => (
          <div key={g.titulo} className="mp-group">
            <h3 className="mp-group-tit">{g.titulo}</h3>
            {g.items.map((s) => (
              <button
                key={s.id}
                className={`pn-menu-row${sec === s.id ? " on" : ""}`}
                aria-current={sec === s.id ? "true" : undefined}
                onClick={() => setSec(s.id)}
              >
                <span className="ico">{s.ico}</span>
                <span className="tx">
                  <b>{s.label}</b>
                  <span>{s.desc}</span>
                </span>
                <span className="chev">›</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <section className="mp-detail">
        {abierta ? (
          <>
            <button className="pn-back mp-back" onClick={() => setSec(null)}>
              ← Mi página
            </button>
            <Seccion id={abierta.id} />
          </>
        ) : (
          <div className="pn-card mp-hint">
            <p className="pn-muted" style={{ margin: 0 }}>
              Elige una sección de la izquierda para editarla.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
