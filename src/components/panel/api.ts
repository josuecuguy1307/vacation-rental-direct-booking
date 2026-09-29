"use client";
import { SITE } from "@/config/site.config";

/* Sesión + fetch autenticado del panel. El token lo emite Supabase Auth
   vía /api/panel/login; expira solo y aquí se respeta esa expiración. */

export type Sess = { access_token: string; expires_at: number; email: string };

const KEY = "cb_panel_sess";

export function getSess(): Sess | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Sess;
    if (!s.access_token) return null;
    if (s.expires_at && s.expires_at * 1000 < Date.now() + 30_000) {
      localStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function setSess(s: Sess | null): void {
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}

async function doFetch(path: string, init: RequestInit): Promise<Response> {
  const s = getSess();
  if (!s) {
    window.dispatchEvent(new Event("cb-panel-logout"));
    throw new ApiError("Sesión expirada — vuelve a entrar", 401);
  }
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${s.access_token}`,
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) {
    setSess(null);
    window.dispatchEvent(new Event("cb-panel-logout"));
    throw new ApiError("Sesión expirada — vuelve a entrar", 401);
  }
  return res;
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await doFetch(path, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError((data.error as string) ?? `Error ${res.status}`, res.status);
  return data as T;
}

/** Descarga autenticada (CSV de caja). */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const res = await doFetch(path, {});
  if (!res.ok) throw new ApiError(`Error ${res.status}`, res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const money = (n: number) => `$${Number(n ?? 0).toFixed(2)}`;
export const codigo = (id: string) => `${SITE.bookingCodePrefix}-${id.slice(0, 8).toUpperCase()}`;

export const fmtFecha = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString(SITE.locale, {
    weekday: "short", day: "numeric", month: "short",
    timeZone: "UTC",
  });

/** "Hoy" en la zona de la propiedad (SITE.timezone) — YYYY-MM-DD.
    Reusa la misma lógica del servidor (lib/dates) para no desalinear el
    "está hospedado ahora" con las fechas locales. */
export const hoyEc = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: SITE.timezone }).format(new Date());

/* ── Estados de cara a la dueña: SOLO TRES + un intermedio interno ──
   Regla dura (Lane 3): una reserva es "real/pagada" SOLO cuando su pago se
   completó por PAYPHONE. Payphone es la única vía de pago de reservas: al
   dar la señal de pago, el código confirma solo (status='confirmed' +
   payment_method='payphone', ver /api/payphone/respuesta y process.ts).
   Las confirmaciones por transferencia/efectivo son para SNACKS, no para
   reservas — por eso NO cuentan como "pagada" aquí.

   · activa    = pagada (Payphone) y hoy ∈ [check_in, check_out)  → hospedado ahora
   · pagada    = pagada (Payphone) pero NO activa (futura o pasada)
   · cancelada = status cancelled
   · pendiente = intermedio interno (esperando pago Payphone); no es uno de los tres. */
export type EstadoTri = "activa" | "pagada" | "cancelada" | "pendiente";

export type EstadoBase = { status: string; check_in: string; check_out: string; payment_method?: string | null };

/** true si el pago entró por Payphone (única vía de pago de reservas). */
export const esPagoPayphone = (m?: string | null) => String(m ?? "").startsWith("payphone");

/** true si la reserva está pagada de verdad: confirmada Y cobrada por Payphone. */
export const esPagada = (r: { status: string; payment_method?: string | null }) =>
  (r.status === "confirmed" || r.status === "completed") && esPagoPayphone(r.payment_method);

/** Deriva el estado de cara a la dueña. `hoy` en YYYY-MM-DD (zona propiedad). */
export function estadoTri(r: EstadoBase, hoy: string = hoyEc()): EstadoTri {
  if (r.status === "cancelled") return "cancelada";
  if (esPagada(r)) return r.check_in <= hoy && hoy < r.check_out ? "activa" : "pagada";
  return "pendiente";
}

/** Etiqueta + tono del badge para un estado. */
export function estadoInfo(e: EstadoTri): { texto: string; tone: "ok" | "warn" | "bad" | "info" } {
  switch (e) {
    case "activa": return { texto: "Activa", tone: "ok" };
    case "pagada": return { texto: "Pagada", tone: "info" };
    case "cancelada": return { texto: "Cancelada", tone: "bad" };
    default: return { texto: "Sin confirmar", tone: "warn" };
  }
}

/** Reserva tal como la devuelve el panel (lista + detalle). Campos opcionales
    porque la lista trae menos que el detalle. Incluye la garantía (Lane 2). */
export type Reserva = {
  id: string; status: string; payment_status: string;
  guest_name: string; guest_email: string; guest_phone: string | null;
  guest_document?: string | null; guest_document_type?: string | null; guest_country?: string | null;
  check_in: string; check_out: string; nights?: number;
  num_guests: number; adults?: number | null; children?: number | null;
  pet_count?: number | null; arrival_time?: string | null;
  companions?: unknown; guest_message?: string | null; notes?: string | null;
  total: number; subtotal?: number | null; extras_total?: number | null; cleaning_fee?: number | null;
  deposit_amount: number; balance_due_cents?: number | null;
  payment_method?: string | null; created_at: string;
  // Garantía reembolsable (Lane 2): estado null = n/a | 'pendiente' | 'reembolsada'
  garantia_amount_cents?: number | null;
  garantia_estado?: string | null;
  garantia_metodo?: string | null;
  garantia_refunded_at?: string | null;
  reservation_addons?: { quantity: number; unit_price: number; addons: { name: string } | null }[];
};
