/**
 * TEST VISUAL DE TODOS LOS CORREOS (sin tocar producción).
 *   npx tsx scripts/test-emails.mts render   → escribe /tmp/email-previews/*.html
 *   npx tsx scripts/test-emails.mts send     → envía [TEST nn/13] a TEST_EMAIL_TO
 *
 * Requiere en .env.local: NEXT_PUBLIC_BASE_URL, INTERNAL_WEBHOOK_SECRET y (para "send")
 * TEST_EMAIL_TO="tu@correo.com" (uno o varios, separados por coma) + tu proveedor de correo.
 * Datos de ejemplo ficticios: huésped "María", totales reales del motor, PDF adjunto real.
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

const { computeQuote } = await import("../src/lib/pricing");
const { TEMPLATES, renderTemplate } = await import("../src/lib/messaging/templates");
const { brandedHtml } = await import("../src/lib/notifications/email");
const { snackReceiptHtml } = await import("../src/lib/snacks-orders");
const { PdfReceiptGenerator } = await import("../src/lib/pdf/receipt");
const { makeOwnerActionToken } = await import("../src/lib/owner-notify");

const MODE = process.argv[2] ?? "render";
const ONLY = (process.argv[3] ?? "").split(",").filter(Boolean).map(Number); // p.ej. "4,11"
const { SITE } = await import("../src/config/site.config");
function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v || /^TU_.*_AQUI$/i.test(v)) {
    console.error(`Missing ${name}. Copy .env.example to .env.local and fill it in (see README).`);
    process.exit(1);
  }
  return v;
}
const BASE = need("NEXT_PUBLIC_BASE_URL").replace(/\/+$/, "");
const DESTS = MODE === "send" ? need("TEST_EMAIL_TO").split(",").map((x) => x.trim()).filter(Boolean) : [];
const GUEST_EMAIL = "maria@example.com";
const GUEST_PHONE = SITE.phonePlaceholder;

/* ── Reserva de ejemplo con números REALES del motor ── */
const CHECK_IN = "2026-06-15";   // lunes
const CHECK_OUT = "2026-06-17";  // miércoles (2 noches weekday $110)
const quote = computeQuote({
  defaultWeekdayCents: 11000, defaultWeekendCents: 11500,
  extraGuestCents: 2500, includedGuests: 4, maxGuests: 8,
  cleaningFee: 25, depositPercentage: 100,
  checkIn: CHECK_IN, checkOut: CHECK_OUT,
  adults: 4, children: 1, seasons: [], addons: [], selections: [],
});
const RID = "cbtest00-1111-4222-8333-444455556666";
const CODIGO = `${SITE.bookingCodePrefix}-CBTEST00`;
const money = (n: number) => `$${n.toFixed(2)}`;

const fmtFecha = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString(SITE.locale, {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });

const VARS: Record<string, string> = {
  nombre: "María",
  codigo: CODIGO,
  fecha_checkin: fmtFecha(CHECK_IN),
  fecha_checkout: fmtFecha(CHECK_OUT),
  hora_checkin: "15h00",
  hora_checkout: "11h00",
  huespedes: "5",
  maps_link: SITE.mapsUrl,
  wifi_nombre: SITE.name,
  wifi_clave: "TU_CLAVE_WIFI",
  review_link: `${BASE}/resena/EJEMPLO-DE-MUESTRA`,
  whatsapp_anfitrion: SITE.whatsappDisplay,
  total: money(quote.total),
  pagado: money(quote.total),
  saldo: "$0.00",
  saldo_frase: "Tu estadía está pagada por completo ✓",
  saldo_info: "",
  link_saldo: "",
};

const META = `Reserva ${CODIGO} · ${CHECK_IN} → ${CHECK_OUT}`;

/* ── builders de los correos de la DUEÑA (espejo de owner-notify) ── */
const ownerText = (lineas: string[]) => lineas.join("\n");
const btn = (url: string, label: string, bg: string) =>
  `<a href="${url}" style="display:inline-block;margin:6px;padding:13px 26px;background:${bg};color:#ffffff;border-radius:8px;text-decoration:none;font-weight:bold">${label}</a>`;

const okUrl = `${BASE}/api/owner/decision/${makeOwnerActionToken(RID, "confirmar")}`;
const noUrl = `${BASE}/api/owner/decision/${makeOwnerActionToken(RID, "rechazar")}`;

const SNACK_ITEMS = [
  { addon_id: "x1", nombre: "Pringles", precio_unit_cents: 150, cantidad: 2 },
  { addon_id: "x2", nombre: "Nutella & Go · breadsticks", precio_unit_cents: 250, cantidad: 1 },
  { addon_id: "x3", nombre: "Canguil ACT II", precio_unit_cents: 200, cantidad: 3 },
];
const SNACK_TOTAL = SNACK_ITEMS.reduce((s, i) => s + i.precio_unit_cents * i.cantidad, 0);

type Mail = { n: number; to: "guest" | "owner"; subject: string; html: string; pdf?: boolean };

const guestTpl = (key: keyof typeof TEMPLATES) => ({
  subject: renderTemplate(TEMPLATES[key].asunto, VARS),
  html: brandedHtml(renderTemplate(TEMPLATES[key].email, VARS), undefined, META),
});

const MAILS: Mail[] = [
  { n: 1, to: "owner", subject: `[${SITE.name}] Nueva reserva ${CODIGO} (pendiente de pago)`,
    html: brandedHtml(ownerText([
      `Huésped: María Pérez López (${GUEST_EMAIL} · ${GUEST_PHONE})`,
      `Fechas: ${CHECK_IN} → ${CHECK_OUT} · 5 huésped(es)`,
      `Total: ${money(quote.total)} · a pagar para confirmar: ${money(quote.deposit_amount)}`,
      `Llegada estimada: 18h00 a 20h00`,
      `Mensaje: "Celebramos un cumpleaños 🎂"`,
    ])) },
  { n: 2, to: "owner", subject: `[${SITE.name}] Comprobante recibido — ${CODIGO}`,
    html: brandedHtml("", `
      <p style="margin:0 0 14px;line-height:1.6"><b>María Pérez López</b> subió el comprobante de transferencia de la reserva <b>${CODIGO}</b> (${CHECK_IN} → ${CHECK_OUT}, 5 huésped/es).</p>
      <p style="margin:0 0 14px;line-height:1.6">Monto a confirmar: <b>${money(quote.deposit_amount)}</b> de ${money(quote.total)} totales.</p>
      <p style="margin:0 0 18px"><a href="${BASE}/snacks" style="color:#7B473A;font-weight:bold">📎 Ver comprobante (MUESTRA)</a> (link válido 72 h)</p>
      <div style="text-align:center;margin:10px 0 6px">
        ${btn(okUrl, "✓ Confirmar pago recibido", "#2E3A2E")}
        ${btn(noUrl, "✗ Rechazar", "#a04030")}
      </div>
      <p style="margin:10px 0 0;font-size:12px;color:#8a7f6b;text-align:center">Botones de un solo uso, sin necesidad de iniciar sesión. (MUESTRA: apuntan a una reserva de prueba)</p>`) },
  { n: 3, to: "owner", subject: `[${SITE.name}] Pago recibido — ${CODIGO}`,
    html: brandedHtml(ownerText([
      `✅ CONFIRMADA (pago recibido)`,
      `Huésped: María Pérez López`,
      `Fechas: ${CHECK_IN} → ${CHECK_OUT} · 5 huéspedes`,
      `Total: ${money(quote.total)} pagado COMPLETO · Transferencia bancaria`,
    ])) },
  { n: 4, to: "guest", pdf: true, ...guestTpl("confirmacion") },
  { n: 5, to: "owner", subject: `[${SITE.name}] Mensaje enviado a María`,
    html: brandedHtml(ownerText([
      `"Confirmación" por email`,
      `${CODIGO} · estadía ${CHECK_IN} → ${CHECK_OUT}`,
    ])) },
  { n: 6, to: "guest", ...guestTpl("antes_llegada") },
  { n: 7, to: "owner", subject: `[${SITE.name}] Hoy llega María Pérez López`,
    html: brandedHtml(ownerText([
      `${CODIGO} · 5 huésped(es)`,
      `Check-in hoy (${CHECK_IN}) · estadía hasta ${CHECK_OUT}`,
      `Contacto: ${GUEST_EMAIL} · ${GUEST_PHONE}`,
    ])) },
  { n: 8, to: "guest", ...guestTpl("despues_primera_noche") },
  { n: 9, to: "guest", subject: `¡Gracias por tu compra! 🍫 Recibo de snacks · ${SITE.name}`,
    html: brandedHtml("", snackReceiptHtml({ id: RID, items: SNACK_ITEMS, total_cents: SNACK_TOTAL }, new Date())) },
  { n: 10, to: "owner", subject: `[${SITE.name}] Pedido de snacks pagado`,
    html: brandedHtml(ownerText([
      `Pringles ×2, Nutella & Go ×1, Canguil ACT II ×3`,
      `Total: ${money(SNACK_TOTAL / 100)} — ${GUEST_EMAIL}`,
    ])) },
  { n: 11, to: "guest", ...guestTpl("antes_salida") },
  { n: 12, to: "guest", ...guestTpl("despues_salida") },
  { n: 13, to: "owner", subject: `[${SITE.name}] Nueva reseña pendiente de moderar`,
    html: brandedHtml(ownerText([
      `María P.: 5⭐`,
      `"La casa es preciosa, la piscina temperada increíble y la atención de 10. ¡Volveremos!"`,
      `Revisar y publicar desde el admin.`,
    ])) },
];

/* ── PDF real del recibo (adjunto del correo 04) ── */
async function makePdf(): Promise<Buffer> {
  const bytes = await new PdfReceiptGenerator().generate({
    reservationId: RID,
    guestName: "María Pérez López",
    guestEmail: GUEST_EMAIL,
    guestDocument: "Cédula 0102030405",
    guestCountry: "Ecuador",
    petCount: 1,
    checkIn: CHECK_IN, checkOut: CHECK_OUT,
    checkInTime: "15h00", checkOutTime: "11h00",
    guests: 5, nights: quote.nights,
    nightly: quote.nightly,
    lodgingTotal: quote.lodging_total,
    extrasTotal: quote.extras_total,
    cleaningFee: quote.cleaning_fee,
    total: quote.total,
    depositPaid: quote.total,
    paymentMethod: "bank_transfer",
    propertyName: SITE.name,
    fullyPaid: true,
  });
  return Buffer.from(bytes);
}

const { writeFileSync, mkdirSync } = await import("node:fs");

if (MODE === "render") {
  mkdirSync("/tmp/email-previews", { recursive: true });
  for (const m of MAILS) {
    const full = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${m.subject}</title></head><body style="margin:0">${m.html}</body></html>`;
    writeFileSync(`/tmp/email-previews/${String(m.n).padStart(2, "0")}.html`, full);
  }
  writeFileSync("/tmp/email-previews/index.txt",
    MAILS.map((m) => `${String(m.n).padStart(2, "0")} [${m.to}] ${m.subject}`).join("\n"));
  console.log(`render OK → /tmp/email-previews (${MAILS.length} correos)`);
  console.log(MAILS.map((m) => `${String(m.n).padStart(2, "0")} [${m.to}] ${m.subject}`).join("\n"));
} else if (MODE === "send") {
  const { sendRawEmail } = await import("../src/lib/notifications/email");
  const pdf = await makePdf();
  let sent = 0, failed = 0;
  console.log(`provider: ${process.env.EMAIL_PROVIDER ?? "resend"} · from: ${process.env.EMAIL_FROM}`);

  for (const m of MAILS) {
    if (ONLY.length && !ONLY.includes(m.n)) continue;
    const subject = `[TEST${ONLY.length ? " v2" : ""} ${String(m.n).padStart(2, "0")}/13] ${m.subject}`;
    for (const to of DESTS) {
      try {
        await sendRawEmail({
          to, subject, html: m.html,
          ...(m.pdf ? { attachments: [{ filename: `Recibo-${SITE.slug}.pdf`, content: pdf }] } : {}),
        });
        sent++; console.log(`✓ ${subject} → ${to}`);
      } catch (e) {
        failed++; console.log(`✗ ${subject} → ${to}: ${String(e).slice(0, 140)}`);
      }
      await new Promise((r) => setTimeout(r, 700)); // cortesía con el proveedor de correo
    }
  }
  console.log(`\nENVIADOS: ${sent} · FALLIDOS: ${failed}`);
}
