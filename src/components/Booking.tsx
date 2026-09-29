"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { CB } from "@/lib/site-data";
import { DOW, MESES, fmtNice, parseD, ymd, type Stay } from "@/lib/ui";
import { ARRIVAL_TIMES, firstIssue, reservationBodySchema, type DocType } from "@/lib/booking-schema";
import { ensurePayphoneAssets, renderPayphoneBox, waitForPayphone } from "@/lib/payphone-box";
import { SITE } from "@/config/site.config";

/* ────────────────────────────────────────────────────────────
   Disponibilidad real — GET /api/availability
   occupied_dates = noches ocupadas (reservas pending/confirmed
   + bloqueos iCal), expandidas día a día por el backend.
   ──────────────────────────────────────────────────────────── */
type Availability = {
  occupied: Set<string>;
  prices: Record<string, number>; // fecha → precio base de esa noche en dólares
  minNights: number;
  maxGuests: number;
};

const FETCH_MONTHS = 18; // ventana consultada desde hoy

function useAvailability() {
  const [avail, setAvail] = useState<Availability | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const from = new Date();
      const to = new Date(from);
      to.setMonth(to.getMonth() + FETCH_MONTHS);
      const qs = new URLSearchParams({
        property: SITE.slug,
        from: ymd(from),
        to: ymd(to),
      });
      const res = await fetch(`/api/availability?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAvail({
        occupied: new Set<string>(data.occupied_dates ?? []),
        prices: data.nightly_prices ?? {},
        minNights: Number(data.min_nights) || CB.minNoches,
        maxGuests: Number(data.max_guests) || CB.maxHuespedes,
      });
    } catch (e) {
      console.error("[availability]", e);
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  return { avail, error, reload: load };
}

/* ────────────────────────────────────────────────────────────
   Cotización EN VIVO — GET /api/quote
   El precio se recalcula 100% en servidor (lib/pricing); la
   tarjeta solo muestra lo que el backend devuelve.
   ──────────────────────────────────────────────────────────── */
type NightLine = {
  date: string;             // noche que empieza en esta fecha
  base_price: number;       // dólares (base de la season o default)
  season: string | null;    // nombre de la season aplicada, null = default
  weekend: boolean;         // true = noche de viernes o sábado
  extra_guests_fee: number; // dólares de huéspedes extra en esa noche
};

type QuoteData = {
  nights: number;
  adults: number;
  children: number;
  guests: number;             // adultos + niños
  included_guests: number;    // cubiertos por el precio base
  extra_guests: number;       // huéspedes del 5to en adelante
  extra_guest_fee: number;    // dólares por huésped extra por noche
  nightly: NightLine[];       // desglose noche a noche
  base_lodging_total: number;
  extra_guests_total: number;
  lodging_total: number;
  cleaning_fee: number;
  extras_total: number;
  pets: number;               // cantidad de mascotas
  pet_unit_price: number;     // $ por mascota (config)
  pets_total: number;         // $ total mascotas
  guarantee: number;          // $ garantía reembolsable
  total: number;
  deposit_percentage: number;
  deposit_amount: number;
  addon_lines: Array<{
    addon_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

/* Formato de dinero para líneas nuevas: entero sin decimales, si no 2 decimales. */
const fmtUsd = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/* Agrupa el desglose noche a noche por (precio, season, semana/finde) para
   pintar una línea por tarifa: "3 noches × $110" / "2 noches × $115 · vie/sáb"
   / "2 noches × $120 · Navidad · vie/sáb". */
function groupNights(nightly: NightLine[]) {
  const groups: Array<{ base_price: number; season: string | null; weekend: boolean; count: number }> = [];
  for (const n of nightly) {
    const g = groups.find(
      (x) => x.base_price === n.base_price && x.season === n.season && x.weekend === n.weekend
    );
    if (g) g.count += 1;
    else groups.push({ base_price: n.base_price, season: n.season, weekend: n.weekend, count: 1 });
  }
  return groups;
}

function useQuote(checkIn: string | null, checkOut: string | null, adults: number, children: number, pets: number) {
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!checkIn || !checkOut) {
      setQuote(null); setError(null); setLoading(false);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({
          property: SITE.slug,
          check_in: checkIn,
          check_out: checkOut,
          adults: String(adults),
          children: String(children),
          pets: String(pets),
        });
        const res = await fetch(`/api/quote?${qs}`, { signal: ctl.signal });
        const data = await res.json();
        if (!res.ok) { setQuote(null); setError(data.error ?? "No se pudo calcular el precio"); }
        else { setQuote(data); setError(null); }
      } catch {
        if (!ctl.signal.aborted) { setQuote(null); setError("No se pudo calcular el precio"); }
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 250); // debounce
    return () => { clearTimeout(t); ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn, checkOut, adults, children, pets]);

  return { quote, loading, error };
}

/* ---------------- CALENDARIO ---------------- */
function Calendar({ stay, setStay, avail, loading, toast }: {
  stay: Stay;
  setStay: React.Dispatch<React.SetStateAction<Stay>>;
  avail: Availability | null;
  loading: boolean;
  toast: (msg: string) => void;
}) {
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, []);
  const occupied = avail?.occupied ?? new Set<string>();
  const prices = avail?.prices ?? {};
  const minNights = avail?.minNights ?? CB.minNoches;
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const { checkIn, checkOut } = stay;

  /* ¿Todas las noches [a, b) están libres? (intervalo medio-abierto:
     la noche de b NO se ocupa → b puede coincidir con el check-in
     de otra reserva sin chocar, igual que el constraint de la DB) */
  const rangeFree = (a: Date, b: Date) => {
    const d = new Date(a);
    while (d < b) {
      if (occupied.has(ymd(d))) return false;
      d.setDate(d.getDate() + 1);
    }
    return true;
  };

  const selectingCheckout = !!checkIn && !checkOut;
  const ciD = checkIn ? parseD(checkIn) : null;
  const coD = checkOut ? parseD(checkOut) : null;

  /* ¿d sirve como check-out del rango en curso? Puede ser una fecha
     "ocupada" (check-in de otra reserva): su noche no nos pertenece. */
  const isValidCheckout = (d: Date) => {
    if (!selectingCheckout || !ciD || d <= ciD) return false;
    const nights = Math.round((d.getTime() - ciD.getTime()) / 86400000);
    if (nights < minNights) return false;
    return rangeFree(ciD, d);
  };

  const pick = (d: Date) => {
    const s = ymd(d);
    const free = !occupied.has(s);

    // sin selección en curso (o rango completo) → nuevo check-in
    if (!selectingCheckout) {
      if (free) setStay((v) => ({ ...v, checkIn: s, checkOut: null }));
      return;
    }

    // seleccionando check-out
    if (isValidCheckout(d)) {
      setStay((v) => ({ ...v, checkOut: s }));
      return;
    }
    if (d <= ciD!) {
      if (free) setStay((v) => ({ ...v, checkIn: s, checkOut: null }));
      return;
    }
    const nights = Math.round((d.getTime() - ciD!.getTime()) / 86400000);
    if (free && nights < minNights) {
      toast(`Estadía mínima: ${minNights} noches`);
      return;
    }
    if (free && !rangeFree(ciD!, d)) {
      // hay noches ocupadas en medio → reinicia el rango desde aquí
      setStay((v) => ({ ...v, checkIn: s, checkOut: null }));
      toast("Hay fechas ocupadas en ese rango");
      return;
    }
  };

  const y = view.getFullYear(), m = view.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));

  const prevDisabled = y === today.getFullYear() && m === today.getMonth();

  return (
    <div className="cal" style={loading ? { opacity: 0.55, pointerEvents: "none" } : {}}>
      <div className="cal__top">
        <button className="cal__nav" disabled={prevDisabled} onClick={() => setView(new Date(y, m - 1, 1))} aria-label="Mes anterior">‹</button>
        <b>{MESES[m]} {y}</b>
        <button className="cal__nav" onClick={() => setView(new Date(y, m + 1, 1))} aria-label="Mes siguiente">›</button>
      </div>
      <div className="cal__grid">
        {DOW.map((d) => <div className="cal__dow" key={d}>{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div className="cal__day empty" key={i}></div>;
          const s = ymd(d);
          const isPast = d < today;
          const isOccupied = occupied.has(s);
          // ocupada pero válida como check-out (medio-abierto) → seleccionable
          const checkoutOk = isOccupied && isValidCheckout(d);
          const isStart = checkIn === s, isEnd = checkOut === s;
          const inRange = !!(ciD && coD && d > ciD && d < coD);
          const single = isStart && !checkOut;
          const clickable = !isPast && (!isOccupied || checkoutOk);

          let cls = "cal__day";
          if (isPast) cls += " past";
          else if (isOccupied && !checkoutOk) cls += " blocked";
          else cls += " avail";
          if (inRange) cls += " in-range";
          if (isStart || isEnd) { cls += " sel"; cls += isStart ? (single ? " single" : " start") : " end"; }

          // precio base de la noche (estilo aerolínea) — solo en fechas
          // disponibles y no pasadas (.blocked y .past no muestran precio)
          const price = !isPast && !(isOccupied && !checkoutOk) ? prices[s] : undefined;

          return (
            <div key={i} className={cls} onClick={() => clickable && pick(d)}>
              <span>{d.getDate()}</span>
              {price != null && <span className="cal__price">${fmtUsd(price)}</span>}
            </div>
          );
        })}
      </div>
      <div className="cal__legend">
        <span><i style={{ background: "var(--brand)" }}></i> Seleccionado</span>
        <span><i style={{ background: "var(--crema)" }}></i> Disponible</span>
        <span><i style={{ background: "#e7ddc8" }}></i> No disponible</span>
      </div>
    </div>
  );
}

/* ---------------- STEPPER ---------------- */
function GuestRow({ label, sub, value, set, min, max, dis }: {
  label: string; sub: string; value: number;
  set: (v: number) => void; min: number; max: number; dis?: boolean;
}) {
  return (
    <div className="guest-row">
      <div className="gl"><b>{label}</b><small>{sub}</small></div>
      <div className="stepper">
        <button onClick={() => set(value - 1)} disabled={value <= min} aria-label={"Menos " + label}>−</button>
        <span>{value}</span>
        <button onClick={() => set(value + 1)} disabled={dis || value >= max} aria-label={"Más " + label}>+</button>
      </div>
    </div>
  );
}

/* ---------------- PAGO POR TRANSFERENCIA ---------------- */
/* Panel de transferencia: datos bancarios con
   botones de copiar + subida de comprobante con estados. */

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button type="button" className={"bk-copy" + (copied ? " ok" : "")} onClick={copy}>
      {copied ? "✓ Copiado" : label}
    </button>
  );
}

function BankTransferPanel({ payment, reservationId, toast }: {
  payment: PaymentInfo;
  reservationId: string;
  toast: (msg: string) => void;
}) {
  const ins = payment.instructions!;
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);

  const upload = async () => {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/reservations/${reservationId}/payment-proof`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? "No se pudo subir el comprobante"); return; }
      setUploaded(true);
      toast("Comprobante enviado ✓");
    } catch {
      toast("Error de conexión — inténtalo de nuevo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bk-bank">
      <p className="bk-bank__title">Paga tu reserva por transferencia</p>
      <div className="bk-bank__rows">
        <div><span>Banco</span><b>{ins.bank_name}</b></div>
        <div><span>Tipo</span><b>{ins.account_type}</b></div>
        <div><span>N° cuenta</span><b className="mono">{ins.account_number || "—"}</b></div>
        <div><span>A nombre de</span><b>{ins.account_holder || "—"}</b></div>
        <div><span>CI / RUC</span><b className="mono">{ins.holder_id || "—"}</b></div>
        <div><span>Referencia</span><b className="mono">{ins.reference}</b></div>
        <div className="bk-bank__amount"><span>Monto a transferir</span><b>${ins.amount.toFixed(2)}</b></div>
      </div>
      <div className="bk-bank__copies">
        <CopyButton text={ins.account_number} label="Copiar cuenta" />
        <CopyButton text={ins.amount.toFixed(2)} label="Copiar monto" />
        <CopyButton text={ins.reference} label="Copiar referencia" />
      </div>

      {uploaded ? (
        <div className="bk-bank__done">
          ✓ Comprobante enviado — verificaremos tu pago y confirmaremos tu reserva por correo.
        </div>
      ) : (
        <div className="bk-bank__upload">
          <label className="btn btn--dark btn--block" style={{ cursor: "pointer" }}>
            {file ? `📎 ${file.name.slice(0, 28)}` : "📷 Subir comprobante de pago"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {file && (
            <button className="btn btn--primary btn--block" onClick={upload} disabled={uploading}>
              {uploading ? "Subiendo…" : "Enviar comprobante"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- PAGO CON TARJETA — CAJITA PAYPHONE ---------------- */
type BoxPhase =
  | { phase: "loading" }
  | { phase: "ready" }
  | { phase: "error"; message: string };

/**
 * Panel del pago con tarjeta: registra el intento vía POST pay-intent
 * (method 'payphone_box') y monta la cajita embebida de Payphone en un
 * div con id único por reserva (la banda de pago fallido y el flujo
 * principal pueden estar montados a la vez). Tras pagar, Payphone redirige
 * a la URL de respuesta configurada en Payphone Developer (confirmación
 * server-side).
 */
function PayphoneBoxPanel({ reservationId, onUnavailable, onGone }: {
  reservationId: string;
  onUnavailable?: () => void;            // tarjeta no disponible → volver a transferencia
  onGone?: (status: 409 | 410) => void;  // 409 ya pagada · 410 expirada
}) {
  const [state, setState] = useState<BoxPhase>({ phase: "loading" });
  // id único por instancia: dos cajitas montadas (banda de reserva A + flujo
  // de reserva B) no deben pelearse por el mismo target
  const boxId = `pp-button-${reservationId}`;

  useEffect(() => {
    let cancelled = false;
    const fail = (message: string) => {
      if (cancelled) return;
      setState({ phase: "error", message });
      onUnavailable?.();
    };

    // Sin token público no hay cajita: ni intentamos cargar el CDN
    const token = process.env.NEXT_PUBLIC_PAYPHONE_TOKEN ?? "";
    if (!token) {
      fail("Pago con tarjeta no disponible por ahora — paga por transferencia");
      return;
    }

    (async () => {
      try {
        // 1) el server registra el intento y devuelve los parámetros de la cajita
        const res = await fetch(`/api/reservations/${reservationId}/pay-intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method: "payphone_box" }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 || res.status === 410) {
          if (!cancelled && onGone) { onGone(res.status); return; }
        }
        if (!res.ok) {
          fail(data?.error ?? "No se pudo iniciar el pago con tarjeta");
          return;
        }
        const payment: PaymentInfo = data.payment ?? data;
        const box = payment?.box;
        if (payment?.kind !== "embedded_box" || !box) {
          fail("Pago con tarjeta no disponible por ahora — paga por transferencia");
          return;
        }

        // 2) assets del CDN (una sola vez) + espera del módulo
        ensurePayphoneAssets();
        await waitForPayphone();
        if (cancelled) return;

        // 3) montar la cajita (montos en CENTAVOS)
        renderPayphoneBox(boxId, box, token);
        setState({ phase: "ready" });
      } catch (e) {
        console.error("[payphone-box]", e);
        fail("No se pudo cargar el pago con tarjeta — paga por transferencia");
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  if (state.phase === "error") {
    return (
      <div className="bk-payphone">
        <div className="bk-payphone__status">
          <p>{state.message}</p>
          {onUnavailable && (
            <button className="btn btn--ghost" style={{ marginTop: 12 }} onClick={onUnavailable}>
              Usar transferencia
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bk-payphone">
      {state.phase === "loading" && <div className="bk-payphone__status">Cargando pago seguro…</div>}
      {/* target de PPaymentButtonBox.render(boxId) — siempre en el DOM */}
      <div id={boxId} className="bk-payphone__box"></div>
      <p className="bk-payphone__note">Pago procesado por Payphone · tarjetas Visa/Mastercard</p>
    </div>
  );
}

/* ---------------- RESERVA ---------------- */

/* Formulario estilo Airbnb (Etapa 12). La validación que manda es la del
   servidor; aquí usamos el MISMO schema zod para avisar antes de enviar. */
type GuestForm = {
  firstName: string;
  lastName: string;
  docType: DocType;
  document: string;
  email: string;
  phone: string;
  country: string;
  arrivalTime: string;
  message: string;
  companions: string[];
};

const EMPTY_FORM: GuestForm = {
  firstName: "", lastName: "", docType: "cedula", document: "",
  email: "", phone: SITE.defaultPhonePrefix, country: SITE.defaultCountry, arrivalTime: "",
  message: "", companions: [],
};

const COUNTRY_SUGGESTIONS = [
  SITE.defaultCountry,
  ...[
    "México", "Colombia", "Perú", "Estados Unidos", "Argentina", "Ecuador",
    "Chile", "España", "Venezuela", "Brasil", "Canadá", "Alemania",
  ].filter((c) => c !== SITE.defaultCountry),
];
type Confirmation = {
  id: string;
  check_in: string;
  check_out: string;
  nights: number;
  num_guests: number;
  pets_total: number;
  guarantee: number;
  total: number;
  deposit_amount: number;
};
type PaymentInfo = {
  provider: string;
  kind: "manual_instructions" | "redirect" | "embedded_box";
  redirect_url?: string;
  /* Cajita embebida de Payphone (espejo de PaymentInstructions.box del server) */
  box?: {
    amount: number;              // CENTAVOS (Payphone: $100 = 10000)
    clientTransactionId: string; // ≤15 chars, único por intento
    reference: string;
    storeId?: string;  // opcional: sin él, Payphone usa la tienda default
  };
  instructions?: {
    bank_name: string;
    account_type: string;
    account_number: string;
    account_holder: string;
    holder_id: string;
    amount: number;
    reference: string;
  };
};

export type PayReturn = { status: "exito" | "fallido" | "pendiente" | "expirado"; rid?: string };

type Props = {
  stay: Stay;
  setStay: React.Dispatch<React.SetStateAction<Stay>>;
  toast: (msg: string) => void;
  payReturn: PayReturn | null;
  dismissPayReturn: () => void;
};

export function Booking({ stay, setStay, toast, payReturn, dismissPayReturn }: Props) {
  // El calendario depende de "hoy" → solo cliente (evita mismatch de hidratación)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { avail, error, reload } = useAvailability();
  const minNights = avail?.minNights ?? CB.minNoches;
  const maxGuests = avail?.maxGuests ?? CB.maxHuespedes;

  const total = stay.adults + stay.children;
  const setAdults = (v: number) =>
    setStay((s) => ({ ...s, adults: Math.max(1, Math.min(v, maxGuests - s.children)) }));
  const setChildren = (v: number) =>
    setStay((s) => ({ ...s, children: Math.max(0, Math.min(v, maxGuests - s.adults)) }));
  const setPets = (v: number) =>
    setStay((s) => ({ ...s, pets: Math.max(0, Math.min(4, v)) }));
  const atMax = total >= maxGuests;

  // Precio EN VIVO calculado por el backend (incluye mascotas + garantía)
  const { quote, loading: quoteLoading, error: quoteError } = useQuote(stay.checkIn, stay.checkOut, stay.adults, stay.children, stay.pets);

  const [form, setForm] = useState<GuestForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [payment, setPayment] = useState<PaymentInfo | null>(null);

  // Wizard por pantallas: 0 fechas · 1 huéspedes · 2 tus datos (cada paso
  // es su propia pantalla — nada amontonado en una sola vista)
  const [bkStep, setBkStep] = useState(0);
  const datesReady = !!(stay.checkIn && stay.checkOut);

  // al COMPLETAR el rango por primera vez avanza solo a "¿Cuántos vienen?".
  // Una sola vez: si el huésped vuelve a "Fechas" a revisarlas, ya no lo
  // rebota hacia adelante — así puede navegar atrás/adelante sin resets.
  const autoAdvanced = useRef(false);
  useEffect(() => {
    if (bkStep === 0 && stay.checkIn && stay.checkOut && !autoAdvanced.current) {
      autoAdvanced.current = true;
      const t = setTimeout(() => setBkStep(1), 650);
      return () => clearTimeout(t);
    }
  }, [stay.checkIn, stay.checkOut, bkStep]);

  // Selector de método de pago tras crear la reserva (solo flujo transferencia/cajita)
  const [payTab, setPayTab] = useState<"transfer" | "card">("transfer");

  // Banda de pago fallido: reintento con tarjeta o transferencia
  const [bandMode, setBandMode] = useState<"none" | "card" | "transfer">("none");
  const [bandPayment, setBandPayment] = useState<PaymentInfo | null>(null);
  const [bandLoading, setBandLoading] = useState(false);

  /* Pide instrucciones de transferencia para la reserva de la banda
     (POST pay-intent method 'bank_transfer'). 409 ya pagada · 410 expirada. */
  const bandTransfer = async () => {
    if (!payReturn?.rid || bandLoading) return;
    setBandLoading(true);
    try {
      const res = await fetch(`/api/reservations/${payReturn.rid}/pay-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "bank_transfer" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast("¡Tu reserva ya está pagada! ✓");
        dismissPayReturn();
        return;
      }
      if (res.status === 410) {
        toast("La reserva expiró — vuelve a elegir tus fechas");
        dismissPayReturn();
        return;
      }
      if (!res.ok) {
        toast(data?.error ?? "No se pudieron obtener los datos de transferencia");
        return;
      }
      const pay: PaymentInfo = data.payment ?? data;
      if (pay?.kind !== "manual_instructions" || !pay.instructions) {
        toast("No se pudieron obtener los datos de transferencia");
        return;
      }
      setBandPayment(pay);
      setBandMode("transfer");
    } catch {
      toast("Error de conexión — inténtalo de nuevo");
    } finally {
      setBandLoading(false);
    }
  };

  /* La cajita de la banda detecta reserva ya pagada (409) o expirada (410). */
  const bandGone = (status: 409 | 410) => {
    toast(status === 409 ? "¡Tu reserva ya está pagada! ✓" : "La reserva expiró — vuelve a elegir tus fechas");
    dismissPayReturn();
  };

  const setField = (k: keyof GuestForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const setCompanion = (i: number, v: string) =>
    setForm((f) => {
      const companions = [...f.companions];
      companions[i] = v;
      return { ...f, companions };
    });

  /* POST /api/reservations — crea la reserva PENDING. */
  const reservar = async () => {
    if (!quote || !stay.checkIn || !stay.checkOut) {
      toast("Elige tus fechas en el calendario"); return;
    }

    // mismo schema zod que valida el servidor: avisa ANTES de enviar
    const payload = {
      property_slug: SITE.slug,
      first_name: form.firstName,
      last_name: form.lastName,
      document_type: form.docType,
      document: form.document,
      email: form.email,
      phone: form.phone,
      country: form.country,
      arrival_time: form.arrivalTime,
      pet_count: stay.pets,
      message: form.message,
      // solo los nombres realmente escritos (los vacíos no viajan)
      companions: form.companions
        .slice(0, Math.max(0, total - 1))
        .map((c) => c.trim())
        .filter(Boolean),
      check_in: stay.checkIn,
      check_out: stay.checkOut,
      adults: stay.adults,
      children: stay.children,
    };
    const checked = reservationBodySchema.safeParse(payload);
    if (!checked.success) {
      toast(firstIssue(checked.error));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checked.data),
      });
      const data = await res.json();

      if (res.status === 409) {
        // otro huésped ganó la carrera (o entró un bloqueo iCal)
        toast("Esas fechas se acaban de ocupar — elige otras, por favor");
        setStay((s) => ({ ...s, checkIn: null, checkOut: null }));
        setBkStep(0); // de vuelta a la pantalla del calendario
        reload(); // refresca el calendario con la ocupación real
        return;
      }
      if (!res.ok) {
        toast(data.error ?? "No se pudo crear la reserva");
        return;
      }

      setConfirmation(data.reservation);
      setPayment(data.payment ?? null);
      reload(); // las fechas recién tomadas se pintan ocupadas

      // Provider con redirección (Pichincha): llevar al pago del anticipo
      if (data.payment?.kind === "redirect" && data.payment.redirect_url) {
        toast("Reserva creada — te llevamos al pago seguro…");
        setTimeout(() => window.location.assign(data.payment.redirect_url), 1600);
      } else {
        toast("¡Reserva creada! ✓");
      }
    } catch {
      toast("Error de conexión — inténtalo de nuevo");
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setConfirmation(null);
    setPayment(null);
    setPayTab("transfer");
    setForm(EMPTY_FORM);
    setBkStep(0);
    autoAdvanced.current = false;
    setStay((s) => ({ ...s, checkIn: null, checkOut: null, pets: 0 }));
  };

  // quote puede quedar "viejo" un render tras limpiar fechas (p.ej. en un 409)
  const hasQuote = !!quote && !!stay.checkIn && !!stay.checkOut;
  const ready = hasQuote && !submitting;

  return (
    <section className="section" id="reservar">
      <div className="wrap">
        <div className="sec-head center reveal">
          <span className="eyebrow center">Reserva directa</span>
          <h2>Arma tu estadía</h2>
          <p className="lead">Pago seguro · Cancelación flexible.</p>
        </div>

        {/* retorno del gateway: pago fallido/cancelado → reintentar con tarjeta o transferencia */}
        {payReturn?.status === "fallido" && payReturn.rid && (
          <div className="payband payband--warn">
            <Icon n="lock" />
            <div>
              <b>Tu pago no se completó</b>
              <p>Tranquilo: tu reserva sigue apartada (pendiente) por unas horas. Reintenta con tarjeta o paga por transferencia.</p>
            </div>
            <div className="payband__actions">
              <button className="btn btn--primary" onClick={() => setBandMode("card")}>
                Reintentar con tarjeta
              </button>
              <button className="btn btn--ghost" onClick={bandTransfer} disabled={bandLoading}>
                {bandLoading ? "Cargando…" : "Pagar por transferencia"}
              </button>
            </div>
            {bandMode === "card" && (
              <div className="payband__panel">
                <PayphoneBoxPanel
                  reservationId={payReturn.rid}
                  onUnavailable={bandTransfer}
                  onGone={bandGone}
                />
              </div>
            )}
            {bandMode === "transfer" && bandPayment?.instructions && (
              <div className="payband__panel">
                <BankTransferPanel payment={bandPayment} reservationId={payReturn.rid} toast={toast} />
              </div>
            )}
            <button className="payband__close" onClick={dismissPayReturn} aria-label="Cerrar">×</button>
          </div>
        )}

        <div className="booking">
          {/* IZQUIERDA: pasos */}
          <div className="bk-panel reveal d1">
            {confirmation ? (
              /* reserva creada: el panel deja paso al pago en el resumen */
              <div className="bk-wizard-done">
                <Icon n="check" />
                <div>
                  <b>¡Reserva creada!</b>
                  <p>Completa el pago en el panel de resumen.</p>
                </div>
              </div>
            ) : (<>
            <div className="bk-wizard" role="tablist" aria-label="Pasos de la reserva">
              {["Fechas", "Huéspedes", "Tus datos"].map((t, i) => {
                const enabled = i === 0 || datesReady;
                return (
                  <button key={t} type="button" role="tab" aria-selected={bkStep === i}
                    className={"bk-wizard__chip" + (bkStep === i ? " on" : "") + (i < bkStep ? " done" : "")}
                    disabled={!enabled}
                    onClick={() => setBkStep(i)}>
                    <span>{i < bkStep ? "✓" : i + 1}</span> {t}
                  </button>
                );
              })}
            </div>

            {bkStep === 0 && (
            <div className="bk-step bk-screen">
              <div className="bk-step__head"><span className="bk-step__num">1</span><h3>Elige tus fechas</h3></div>
              {mounted
                ? <Calendar stay={stay} setStay={setStay} avail={avail} loading={!avail && !error} toast={toast} />
                : <div style={{ minHeight: 360 }} />}
              {mounted && !avail && !error && (
                <p className="bk-line__sub" style={{ marginTop: 10 }}>Cargando disponibilidad…</p>
              )}
              {mounted && error && (
                <p className="bk-line__sub" style={{ marginTop: 10 }}>
                  No se pudo cargar la disponibilidad.{" "}
                  <a onClick={reload} style={{ textDecoration: "underline", cursor: "pointer", color: "var(--accent)" }}>
                    Reintentar
                  </a>
                </p>
              )}
              <div className="bk-stepnav">
                <span />
                <button className="btn btn--primary" disabled={!datesReady} onClick={() => setBkStep(1)}>
                  Siguiente
                </button>
              </div>
            </div>
            )}

            {bkStep === 1 && (
            <div className="bk-step bk-screen">
              <div className="bk-step__head"><span className="bk-step__num">2</span><h3>¿Cuántos vienen?</h3></div>
              <div className="guests">
                <GuestRow label="Adultos" sub="13 años o más" value={stay.adults} set={setAdults} min={1} max={maxGuests} dis={atMax} />
                <GuestRow label="Niños" sub="2 a 12 años" value={stay.children} set={setChildren} min={0} max={maxGuests} dis={atMax} />
                <GuestRow label="Mascotas" sub={quote?.pet_unit_price ? `🐾 máx 4 · $${fmtUsd(quote.pet_unit_price)} c/u` : "🐾 máx 4"} value={stay.pets} set={setPets} min={0} max={4} />
              </div>
              <p className="bk-line__sub" style={{ marginTop: 8 }}>
                Capacidad máxima {maxGuests} huéspedes · el precio base cubre hasta{" "}
                {CB.huespedesIncluidos}; del {CB.huespedesIncluidos + 1}to en adelante
                +${CB.extraPorNoche} por persona por noche.
              </p>
              <div className="bk-stepnav">
                <button type="button" className="btn btn--ghost" onClick={() => setBkStep(0)}>Atrás</button>
                <button type="button" className="btn btn--primary" onClick={() => setBkStep(2)}>Siguiente</button>
              </div>
            </div>
            )}

            {bkStep === 2 && (
            <div className="bk-step bk-screen">
              <div className="bk-step__head"><span className="bk-step__num">3</span><h3>Tus datos</h3></div>
              <div className="bk-form">
                <label className="bk-field">
                  <span>Nombres</span>
                  <input type="text" autoComplete="given-name" placeholder="Como aparecen en tu documento"
                    value={form.firstName} onChange={setField("firstName")} disabled={!!confirmation} />
                </label>
                <label className="bk-field">
                  <span>Apellidos</span>
                  <input type="text" autoComplete="family-name" placeholder="Tus apellidos"
                    value={form.lastName} onChange={setField("lastName")} disabled={!!confirmation} />
                </label>
                <label className="bk-field bk-field--full">
                  <span>Documento de identidad</span>
                  <div className="bk-doc">
                    <select
                      value={form.docType}
                      onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value as DocType }))}
                      disabled={!!confirmation}
                      aria-label="Tipo de documento"
                    >
                      <option value="cedula">Cédula</option>
                      <option value="pasaporte">Pasaporte</option>
                    </select>
                    <input type="text" inputMode={form.docType === "cedula" ? "numeric" : "text"}
                      placeholder={form.docType === "cedula" ? "10 dígitos" : "Número de pasaporte"}
                      value={form.document} onChange={setField("document")} disabled={!!confirmation} />
                  </div>
                </label>
                <label className="bk-field">
                  <span>Correo</span>
                  <input type="email" autoComplete="email" placeholder="tu@correo.com"
                    value={form.email} onChange={setField("email")} disabled={!!confirmation} />
                </label>
                <label className="bk-field">
                  <span>Teléfono / WhatsApp</span>
                  <input type="tel" autoComplete="tel" placeholder={SITE.phonePlaceholder}
                    value={form.phone} onChange={setField("phone")} disabled={!!confirmation} />
                </label>
                <label className="bk-field">
                  <span>País</span>
                  <input type="text" list="bk-countries" autoComplete="country-name" placeholder="¿De dónde nos visitas?"
                    value={form.country} onChange={setField("country")} disabled={!!confirmation} />
                  <datalist id="bk-countries">
                    {COUNTRY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </label>
                <label className="bk-field">
                  <span>Hora estimada de llegada</span>
                  <select value={form.arrivalTime} onChange={setField("arrivalTime")} disabled={!!confirmation}>
                    <option value="" disabled>Elige una franja</option>
                    {ARRIVAL_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>

                {total > 1 && (
                  <div className="bk-field bk-field--full bk-companions">
                    <span>¿Quiénes te acompañan? <small>(opcional)</small></span>
                    {Array.from({ length: total - 1 }, (_, i) => (
                      <input key={i} type="text" placeholder={`Huésped ${i + 2} — nombre y apellido`}
                        value={form.companions[i] ?? ""} onChange={(e) => setCompanion(i, e.target.value)}
                        disabled={!!confirmation} />
                    ))}
                  </div>
                )}

                <label className="bk-field bk-field--full">
                  <span>Mensaje al anfitrión <small>(opcional)</small></span>
                  <textarea rows={3} maxLength={500}
                    placeholder="Cuéntanos si celebras algo especial o si necesitas algo para tu llegada"
                    value={form.message} onChange={setField("message")} disabled={!!confirmation} />
                </label>
              </div>
              <div className="bk-stepnav">
                <button type="button" className="btn btn--ghost" onClick={() => setBkStep(1)}>Atrás</button>
                <span className="bk-stepnav__hint">Confirma en el panel de resumen</span>
              </div>
            </div>
            )}
            </>)}
          </div>

          {/* DERECHA: resumen sticky */}
          <aside className="bk-summary reveal d2">
            <div className="bk-summary__photo">
              <img src="/assets/photos/piscina-casa.jpg" alt={SITE.name} />
              <div className="tag"><b>{SITE.name}</b><small>{SITE.location}</small></div>
            </div>
            <div className="bk-summary__body">
              {confirmation ? (
                /* ── Reserva creada (pending) ── */
                <div className="bk-confirm">
                  <span className="bk-confirm__ic"><Icon n="check" /></span>
                  <h4>¡Reserva creada!</h4>
                  <p className="bk-confirm__code">Código: <b>{confirmation.id.slice(0, 8).toUpperCase()}</b></p>
                  <div className="bk-line muted" style={{ justifyContent: "center", gap: 14 }}>
                    <span>{fmtNice(confirmation.check_in)} → {fmtNice(confirmation.check_out)}</span>
                    <span>{confirmation.num_guests} huésped{confirmation.num_guests > 1 ? "es" : ""}</span>
                  </div>
                  <div className="bk-divider"></div>
                  <div className="bk-total"><b>Total</b><span className="amt">${fmtUsd(confirmation.total)}</span></div>
                  <div className="bk-deposit">
                    <div className="row">
                      <span><small>Total a pagar para confirmar</small></span>
                      <b>${fmtUsd(confirmation.deposit_amount)}</b>
                    </div>
                    <small>
                      {payment?.kind === "manual_instructions" && payTab === "transfer"
                        ? "Tus fechas quedan apartadas mientras realizas la transferencia."
                        : "Tus fechas quedan apartadas mientras completas el pago."}
                    </small>
                    {confirmation.guarantee > 0 && (
                      <small style={{ display: "block", marginTop: 6 }}>
                        Incluye ${fmtUsd(confirmation.guarantee)} de garantía reembolsable.
                      </small>
                    )}
                  </div>
                  {payment?.kind === "redirect" && payment.redirect_url && (
                    <>
                      <a className="btn btn--primary btn--block btn--lg" style={{ marginTop: 16 }} href={payment.redirect_url}>
                        Pagar · Banco Pichincha
                      </a>
                      <div className="bk-secure"><Icon n="lock" /> Si no eres redirigido, usa el botón</div>
                    </>
                  )}
                  {/* sin redirección → el huésped elige cómo pagar el anticipo:
                      transferencia (default, payment ya en mano) o tarjeta (cajita) */}
                  {payment?.kind === "manual_instructions" && payment.instructions && (
                    <>
                      <div className="bk-paytabs" role="tablist" aria-label="Método de pago">
                        <button
                          role="tab"
                          aria-selected={payTab === "transfer"}
                          className={"bk-paytabs__tab" + (payTab === "transfer" ? " active" : "")}
                          onClick={() => setPayTab("transfer")}
                        >
                          Transferencia bancaria
                        </button>
                        <button
                          role="tab"
                          aria-selected={payTab === "card"}
                          className={"bk-paytabs__tab" + (payTab === "card" ? " active" : "")}
                          onClick={() => setPayTab("card")}
                        >
                          Pagar con tarjeta
                        </button>
                      </div>
                      {payTab === "transfer" ? (
                        <BankTransferPanel payment={payment} reservationId={confirmation.id} toast={toast} />
                      ) : (
                        <PayphoneBoxPanel
                          reservationId={confirmation.id}
                          onUnavailable={() => setPayTab("transfer")}
                        />
                      )}
                    </>
                  )}
                  {/* provider activo = payphone: la cajita llega directo al crear la reserva */}
                  {payment?.kind === "embedded_box" && (
                    <PayphoneBoxPanel reservationId={confirmation.id} />
                  )}
                  <button className="btn btn--ghost btn--block" style={{ marginTop: 16 }} onClick={resetAll}>
                    Hacer otra reserva
                  </button>
                </div>
              ) : (
                <>
                  {hasQuote ? (
                    <div className="bk-line muted">
                      <span>{fmtNice(stay.checkIn!)} → {fmtNice(stay.checkOut!)}</span>
                      <span>{total} huésped{total > 1 ? "es" : ""}</span>
                    </div>
                  ) : (
                    <div className="bk-empty">
                      {quoteLoading ? "Calculando precio…" : quoteError ?? "Elige tus fechas para ver el precio"}
                    </div>
                  )}

                  {hasQuote && quote && (
                    <div style={quoteLoading ? { opacity: 0.55 } : {}}>
                      {/* una línea por tarifa: noches agrupadas por (precio base, season) */}
                      {groupNights(quote.nightly).map((g) => (
                        <div className="bk-line" key={`${g.base_price}|${g.season ?? ""}|${g.weekend}`}>
                          <span>
                            {g.count} noche{g.count > 1 ? "s" : ""} × ${fmtUsd(g.base_price)}
                            {g.season ? ` · ${g.season}` : ""}
                            {g.weekend ? " · vie/sáb" : ""}
                          </span>
                          <span>${fmtUsd(g.count * g.base_price)}</span>
                        </div>
                      ))}
                      {quote.extra_guests > 0 && (
                        <div className="bk-line">
                          <span>
                            Huéspedes extra: {quote.extra_guests} × ${fmtUsd(quote.extra_guest_fee)} × {quote.nights} noche{quote.nights > 1 ? "s" : ""}
                          </span>
                          <span>${fmtUsd(quote.extra_guests_total)}</span>
                        </div>
                      )}
                      {quote.pets_total > 0 && (
                        <div className="bk-line">
                          <span>Mascota{quote.pets > 1 ? "s" : ""}: {quote.pets} × ${fmtUsd(quote.pet_unit_price)}</span>
                          <span>${fmtUsd(quote.pets_total)}</span>
                        </div>
                      )}
                      {quote.cleaning_fee > 0 && (
                        <div className="bk-line"><span>Limpieza</span><span>${fmtUsd(quote.cleaning_fee)}</span></div>
                      )}
                      {quote.guarantee > 0 && (
                        <div className="bk-line"><span>Garantía reembolsable</span><span>${fmtUsd(quote.guarantee)}</span></div>
                      )}
                      <div className="bk-divider"></div>
                      <div className="bk-total"><b>Total</b><span className="amt">${fmtUsd(quote.total)}</span></div>
                      <div className="bk-deposit">
                        <div className="row">
                          <span><small>Total a pagar para confirmar</small></span>
                          <b>${fmtUsd(quote.deposit_amount)}</b>
                        </div>
                        <small>Tu reserva se confirma con el pago total. Cancelación flexible.</small>
                        {quote.guarantee > 0 && (
                          <small style={{ display: "block", marginTop: 6 }}>
                            Incluye ${fmtUsd(quote.guarantee)} de garantía reembolsable — se te devuelve al final de tu estadía.
                          </small>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    className="btn btn--primary btn--block btn--lg bk-cta"
                    onClick={reservar}
                    disabled={!ready}
                    style={!ready ? { opacity: 0.55, cursor: "not-allowed" } : {}}
                  >
                    {submitting ? "Creando reserva…" : hasQuote && quote ? `Pagar $${fmtUsd(quote.deposit_amount)} y reservar` : "Reservar ahora"}
                  </button>
                  <div className="bk-secure"><Icon n="lock" /> Pago seguro · No se cobra todavía</div>
                </>
              )}
            </div>
          </aside>
        </div>

        <div className="directband reveal">
          <Icon n="shield" />
          <div>
            <b>Reservas directo con el anfitrión, sin comisiones de intermediarios</b>
            <p>Mejor precio garantizado, trato cercano y políticas de cancelación claras. Nada de cargos ocultos de Airbnb o Booking.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
