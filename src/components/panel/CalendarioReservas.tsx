"use client";

import { esPagada, estadoTri, type Reserva } from "./api";
import { SITE } from "@/config/site.config";

/* Calendario mensual de ocupación (mobile-first, sin libs). Cada noche
   [check_in, check_out) se pinta con el color de su estado; tocar un día
   ocupado abre el detalle de esa reserva. Solo se muestran las reservas
   pagadas (activa/pagada); las canceladas liberan la fecha. */

const DOW = ["L", "M", "X", "J", "V", "S", "D"]; // semana inicia lunes
const pad = (n: number) => String(n).padStart(2, "0");

export default function CalendarioReservas({
  reservas,
  year,
  month, // 0–11
  hoy,
  onPrev,
  onNext,
  onSelect,
}: {
  reservas: Reserva[];
  year: number;
  month: number;
  hoy: string;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (id: string) => void;
}) {
  const ocupables = reservas.filter(esPagada);
  const titulo = new Date(year, month, 1).toLocaleDateString(SITE.locale, {
    month: "long",
    year: "numeric",
  });

  const primeraSemana = (new Date(year, month, 1).getDay() + 6) % 7; // lunes = 0
  const dias = new Date(year, month + 1, 0).getDate();
  const celdas: (number | null)[] = [
    ...Array(primeraSemana).fill(null),
    ...Array.from({ length: dias }, (_, i) => i + 1),
  ];
  while (celdas.length % 7 !== 0) celdas.push(null);

  const reservaDe = (fecha: string) =>
    ocupables.find((r) => r.check_in <= fecha && fecha < r.check_out) ?? null;

  return (
    <div className="pn-cal">
      <div className="pn-cal-head">
        <button className="pn-cal-nav" onClick={onPrev} aria-label="Mes anterior">‹</button>
        <b className="pn-cal-title">{titulo}</b>
        <button className="pn-cal-nav" onClick={onNext} aria-label="Mes siguiente">›</button>
      </div>

      <div className="pn-cal-grid pn-cal-dow">
        {DOW.map((d, i) => (
          <span key={i} className="pn-cal-dowc">{d}</span>
        ))}
      </div>

      <div className="pn-cal-grid">
        {celdas.map((day, i) => {
          if (day === null) return <span key={i} className="pn-cal-cell empty" />;
          const fecha = `${year}-${pad(month + 1)}-${pad(day)}`;
          const r = reservaDe(fecha);
          const est = r ? estadoTri(r, hoy) : null;
          const esHoy = fecha === hoy;
          const start = r?.check_in === fecha;
          const end = r ? fecha === prevDay(r.check_out) : false;
          const sale = ocupables.some((x) => x.check_out === fecha); // alguien se va ese día

          const cls = [
            "pn-cal-cell",
            r ? "occ" : "",
            est ? `occ-${est}` : "",
            start ? "occ-start" : "",
            end ? "occ-end" : "",
            esHoy ? "hoy" : "",
          ].filter(Boolean).join(" ");

          if (r) {
            return (
              <button key={i} className={cls} onClick={() => onSelect(r.id)} title={r.guest_name}>
                <span className="pn-cal-num">{day}</span>
                {start && <span className="pn-cal-name">{firstName(r.guest_name)}</span>}
              </button>
            );
          }
          return (
            <span key={i} className={cls}>
              <span className="pn-cal-num">{day}</span>
              {sale && <span className="pn-cal-out" aria-hidden title="salida" />}
            </span>
          );
        })}
      </div>

      <div className="pn-cal-legend">
        <span><i className="dot activa" /> Activa (hospedado hoy)</span>
        <span><i className="dot pagada" /> Pagada</span>
      </div>
    </div>
  );
}

const pad2 = (n: number) => String(n).padStart(2, "0");
/** día anterior a una fecha YYYY-MM-DD (para la última noche = check_out − 1). */
function prevDay(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() - 1);
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}
const firstName = (n: string) => n.split(" ")[0];
