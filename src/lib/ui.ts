/* Utilidades de UI compartidas (del diseño original) */

export type Stay = {
  checkIn: string | null;
  checkOut: string | null;
  adults: number;
  children: number;
  pets: number;
};

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) {
    const y = el.getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo({ top: y, behavior: "smooth" });
  }
}

export const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
export const DOW = ["dom","lun","mar","mié","jue","vie","sáb"];

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseD = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const fmtNice = (s: string) => {
  const d = parseD(s);
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
};
