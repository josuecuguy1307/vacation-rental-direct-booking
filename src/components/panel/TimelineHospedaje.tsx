"use client";

import { fmtFecha, hoyEc, money, type Reserva } from "./api";

/* Timeline VISUAL del hospedaje de una reserva. Se puebla con datos reales:
   · mensajes programados (scheduled_messages, vía …/[id]/timeline)
   · fechas de check-in / check-out vs. hoy (zona propiedad)
   · estado de la garantía (Lane 2)
   No inventa stages: marca lo que ya pasó, dónde va HOY y lo que falta. */

export type TlItem = { template_key: string; status: string; send_at: string; sent_at: string | null };

type Stage = { key: string; icon: string; label: string; sub: string; done: boolean };

export default function TimelineHospedaje({
  reserva,
  items,
}: {
  reserva: Reserva;
  items: TlItem[];
}) {
  const hoy = hoyEc();
  const find = (k: string) => items.find((i) => i.template_key === k);
  const conf = find("confirmacion");
  const bienv = find("antes_llegada");

  const checkinDone = hoy >= reserva.check_in;
  const checkoutDone = hoy >= reserva.check_out; // check-out exclusivo: el día de salida ya cuenta como salido
  const activa = reserva.check_in <= hoy && hoy < reserva.check_out;
  const garCents = Number(reserva.garantia_amount_cents ?? 0);
  const garReemb = reserva.garantia_estado === "reembolsada";

  const bienvSub =
    !bienv
      ? "—"
      : bienv.status === "sent"
        ? `Enviada${bienv.sent_at ? ` · ${fmtFecha(bienv.sent_at.slice(0, 10))}` : ""}`
        : bienv.status === "cancelled"
          ? "Cancelada"
          : bienv.status === "failed"
            ? "No se pudo enviar"
            : `Programada · ${fmtFecha(bienv.send_at.slice(0, 10))}`;

  const stages: Stage[] = [
    {
      key: "conf",
      icon: "📝",
      label: "Reserva confirmada",
      sub: conf?.sent_at ? `Confirmada · ${fmtFecha(conf.sent_at.slice(0, 10))}` : "Pago recibido",
      done: true,
    },
    {
      key: "bienv",
      icon: "✉️",
      label: "Mensaje de bienvenida",
      sub: bienvSub,
      done: bienv?.status === "sent",
    },
    {
      key: "checkin",
      icon: "🛬",
      label: "Check-in",
      sub: `${fmtFecha(reserva.check_in)}${reserva.arrival_time ? ` · ~${reserva.arrival_time}` : ""}`,
      done: checkinDone,
    },
    {
      key: "estadia",
      icon: "🏡",
      label: activa ? "Estadía en curso" : "Estadía",
      sub: activa
        ? "El huésped está hospedado ahora"
        : `${reserva.nights ? `${reserva.nights} noche(s)` : ""}`,
      done: checkoutDone,
    },
    {
      key: "checkout",
      icon: "🧳",
      label: "Check-out",
      sub: fmtFecha(reserva.check_out),
      done: checkoutDone,
    },
  ];

  if (garCents > 0) {
    stages.push({
      key: "gar",
      icon: "🔁",
      label: "Garantía devuelta",
      sub: garReemb
        ? `Devuelta${reserva.garantia_refunded_at ? ` · ${fmtFecha(reserva.garantia_refunded_at.slice(0, 10))}` : ""}`
        : `Pendiente · ${money(garCents / 100)}`,
      done: garReemb,
    });
  }

  // "Ahora": el primer stage que aún no está hecho (la frontera).
  const frontier = stages.findIndex((s) => !s.done);

  return (
    <div className="pn-card">
      <h3>Timeline del hospedaje</h3>
      <ol className="pn-tl">
        {stages.map((s, i) => {
          const state = s.done ? "done" : i === frontier ? "now" : "todo";
          return (
            <li key={s.key} className={`pn-tl-item ${state}`}>
              <span className="pn-tl-dot" aria-hidden>
                {s.done ? "✓" : state === "now" ? "●" : ""}
              </span>
              <div className="pn-tl-body">
                <div className="pn-tl-label">
                  <span className="pn-tl-ico" aria-hidden>{s.icon}</span> {s.label}
                  {state === "now" && <span className="pn-badge ok pn-tl-nowbadge">Ahora</span>}
                </div>
                {s.sub && <div className="pn-tl-sub">{s.sub}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
