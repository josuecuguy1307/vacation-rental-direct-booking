/* ============================================================
   Cajita de pagos embebida de Payphone v2.0 — utilidades de
   CLIENTE compartidas por la reserva (Booking) y el carrito de
   snacks (/snacks). El browser usa NEXT_PUBLIC_PAYPHONE_TOKEN
   (token exponible por diseño); el server confirma con el suyo.
   ============================================================ */

const PAYPHONE_CSS = "https://cdn.payphonetodoesposible.com/box/v2.0/payphone-payment-box.css";
const PAYPHONE_JS = "https://cdn.payphonetodoesposible.com/box/v2.0/payphone-payment-box.js";

declare global {
  interface Window {
    /* Constructor que expone el módulo del CDN al cargar */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    PPaymentButtonBox?: any;
  }
}

/** Parámetros de la cajita que devuelve el server (pay-intent / orders). */
export type BoxParams = {
  amount: number;              // CENTAVOS
  clientTransactionId: string; // ≤15 chars (CB… reserva · SN… snacks)
  reference: string;
  storeId?: string;            // opcional: sin él, Payphone usa la tienda default
};

/** Inyecta el <link> y el <script type="module"> del CDN si aún no existen. */
export function ensurePayphoneAssets(): void {
  if (!document.querySelector(`link[href="${PAYPHONE_CSS}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = PAYPHONE_CSS;
    document.head.appendChild(link);
  }
  if (!document.querySelector(`script[src="${PAYPHONE_JS}"]`)) {
    const script = document.createElement("script");
    script.type = "module";
    script.src = PAYPHONE_JS;
    document.head.appendChild(script);
  }
}

/** Espera (poll de 100 ms, timeout 10 s) a que el módulo exponga el constructor. */
export function waitForPayphone(timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (window.PPaymentButtonBox) return resolve();
      if (Date.now() - t0 > timeoutMs) return reject(new Error("Timeout cargando la cajita de Payphone"));
      setTimeout(tick, 100);
    };
    tick();
  });
}

/** Monta la cajita en el div `targetId` con los parámetros del server. */
export function renderPayphoneBox(targetId: string, box: BoxParams, token: string): void {
  const target = document.getElementById(targetId);
  if (target) target.innerHTML = ""; // evita duplicados (StrictMode/dev)
  new window.PPaymentButtonBox({
    token,
    clientTransactionId: box.clientTransactionId,
    amount: box.amount,
    amountWithoutTax: box.amount,
    currency: "USD",
    ...(box.storeId ? { storeId: box.storeId } : {}),
    reference: box.reference,
    lang: "es",
    defaultMethod: "card",
  }).render(targetId);
}
