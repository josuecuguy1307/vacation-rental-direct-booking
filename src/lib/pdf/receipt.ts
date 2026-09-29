import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE } from "@/config/site.config";

/* ============================================================
   Recibo de confirmación en PDF (Etapa 11).

   IMPORTANTE: esto es un RECIBO de confirmación de reserva,
   NO una factura electrónica (SRI). El generador está
   desacoplado a propósito: cuando el cliente contrate un
   facturador (Dátil / Contifico), se implementa otro
   ReceiptGenerator con la misma interfaz y se enchufa en
   confirmReservation sin tocar nada más.
   ============================================================ */

export type ReceiptNight = {
  date: string;
  base_price: number;
  season: string | null;
  weekend?: boolean;        // true = noche de viernes o sábado (split 8.5)
  extra_guests_fee: number;
};

export type ReceiptData = {
  reservationId: string;
  guestName: string;
  guestEmail: string;
  guestDocument?: string | null;     // "Cédula 0102030405" ya formateado
  guestCountry?: string | null;
  petCount?: number | null;
  checkIn: string;             // YYYY-MM-DD
  checkOut: string;
  checkInTime: string;         // "15h00"
  checkOutTime: string;
  guests: number;
  nights: number;
  nightly: ReceiptNight[] | null;  // desglose noche a noche (price_breakdown)
  lodgingTotal: number;        // subtotal alojamiento
  extrasTotal: number;
  petsTotal?: number;          // cargo por mascota(s) (0 = sin mascota)
  cleaningFee: number;
  guarantee?: number;          // garantía reembolsable (0 = sin garantía)
  total: number;
  depositPaid: number;         // PAGADO A LA FECHA (anticipo, o total si fullyPaid)
  paymentMethod: string;       // 'bank_transfer' | 'payphone' | ...
  propertyName: string;
  fullyPaid?: boolean;         // true → "PAGADO COMPLETO", saldo $0
};

/** Interfaz del generador — implementable por un facturador SRI a futuro. */
export interface ReceiptGenerator {
  generate(data: ReceiptData): Promise<Uint8Array>;
}

// ── Textos editables del recibo ─────────────────────────────
const CHECKIN_POLICY = [
  "Check-in desde la hora indicada; si llegas mas tarde, avisanos por WhatsApp.",
  "Al llegar al porton, escribenos y te recibimos.",
];
// Solo se muestra cuando queda saldo por cobrar (pago parcial); con pago 100% no aplica.
const CHECKIN_SALDO = "El saldo pendiente se cancela a tu llegada (efectivo o transferencia).";
const HOUSE_POLICY = [
  "Capacidad maxima 8 huespedes. No fiestas ni eventos sin autorizacion.",
  "Cancelacion flexible: consulta condiciones al anfitrion.",
  "Cuida la casa como tuya: cualquier dano se evalua al check-out.",
];

const PAY_METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Transferencia bancaria",
  payphone: "Tarjeta (Payphone)",
  pichincha: "Banco Pichincha",
};

const money = (n: number) => `$${n.toFixed(2)}`;

const fmtDate = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString(SITE.locale, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "UTC",
  });

/* pdf-lib con fuentes estándar usa WinAnsi: tildes y ñ están OK,
   pero nada de emojis ni "→" en los textos de este archivo. */

// paleta la propiedad
const BRAND = rgb(0.18, 0.227, 0.18);     // #2E3A2E
const ESPRESSO = rgb(0.235, 0.169, 0.137);
const MUTED = rgb(0.45, 0.42, 0.38);
const LINE = rgb(0.85, 0.82, 0.76);

export class PdfReceiptGenerator implements ReceiptGenerator {
  async generate(d: ReceiptData): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // A4
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const left = 56;
    const right = 595.28 - 56;
    let y = 780;

    const text = (s: string, opts: { x?: number; size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => {
      page.drawText(s, {
        x: opts.x ?? left, y,
        size: opts.size ?? 10,
        font: opts.font ?? font,
        color: opts.color ?? ESPRESSO,
      });
    };
    const textRight = (s: string, size = 10, f: PDFFont = font, color = ESPRESSO) => {
      const w = f.widthOfTextAtSize(s, size);
      page.drawText(s, { x: right - w, y, size, font: f, color });
    };
    const hr = () => {
      page.drawLine({ start: { x: left, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 0.7, color: LINE });
    };

    // ── Cabecera ──
    page.drawRectangle({ x: 0, y: 805, width: 595.28, height: 36.89, color: BRAND });
    page.drawText(`${SITE.name.toUpperCase()}`, { x: left, y: 817, size: 15, font: bold, color: rgb(0.89, 0.855, 0.776) });
    page.drawText(SITE.location, { x: right - font.widthOfTextAtSize(SITE.location, 9), y: 819, size: 9, font, color: rgb(0.89, 0.855, 0.776) });

    text("RECIBO DE CONFIRMACION DE RESERVA", { size: 13, font: bold, color: BRAND });
    y -= 14;
    text(`Codigo: ${d.reservationId.slice(0, 8).toUpperCase()}  ·  ID: ${d.reservationId}`, { size: 8, color: MUTED });
    y -= 24;

    // ── Huésped y estadía ──
    text("HUESPED", { size: 8, font: bold, color: MUTED });
    y -= 13;
    text(`${d.guestName}  ·  ${d.guestEmail}`, { size: 10 });
    y -= 13;
    if (d.guestDocument || d.guestCountry) {
      text(
        [d.guestDocument, d.guestCountry].filter(Boolean).join("  ·  "),
        { size: 9, color: MUTED }
      );
      y -= 13;
    }
    y -= 7;

    text("ESTADIA", { size: 8, font: bold, color: MUTED });
    y -= 13;
    text(`Check-in:  ${fmtDate(d.checkIn)} · desde las ${d.checkInTime}`);
    y -= 13;
    text(`Check-out: ${fmtDate(d.checkOut)} · hasta las ${d.checkOutTime}`);
    y -= 13;
    text(
      `${d.nights} noche(s) · ${d.guests} huesped(es)` +
      (d.petCount ? ` · ${d.petCount} mascota(s)` : "") +
      ` · ${d.propertyName}`
    );
    y -= 22;

    // ── Desglose ──
    text("DETALLE DE PRECIOS", { size: 8, font: bold, color: MUTED });
    y -= 15;

    const line = (label: string, amount: number, sub = false) => {
      text(label, { size: sub ? 9 : 10, color: sub ? MUTED : ESPRESSO, x: sub ? left + 10 : left });
      textRight(money(amount), sub ? 9 : 10, font, sub ? MUTED : ESPRESSO);
      y -= sub ? 12 : 14;
    };

    if (d.nightly?.length) {
      // agrupar por (base, season, semana/finde):
      // "3 noches x $110.00" / "2 noches x $120.00 (Navidad, vie/sab)"
      const groups: Array<{ base: number; season: string | null; weekend: boolean; count: number }> = [];
      for (const n of d.nightly) {
        const w = n.weekend ?? false;
        const g = groups.find((x) => x.base === n.base_price && x.season === n.season && x.weekend === w);
        if (g) g.count++;
        else groups.push({ base: n.base_price, season: n.season, weekend: w, count: 1 });
      }
      for (const g of groups) {
        const tags = [g.season, g.weekend ? "vie/sab" : null].filter(Boolean).join(", ");
        line(
          `${g.count} noche(s) x ${money(g.base)}${tags ? ` (${tags})` : ""}`,
          g.count * g.base
        );
      }
      const extras = d.nightly.reduce((s, n) => s + n.extra_guests_fee, 0);
      if (extras > 0) line("Huespedes adicionales", extras);
    } else {
      line(`Alojamiento (${d.nights} noches)`, d.lodgingTotal);
    }
    if (d.petsTotal && d.petsTotal > 0) {
      const n = d.petCount ?? 0;
      line(n > 0 ? `Mascota(s): ${n} x ${money(d.petsTotal / n)}` : "Mascota(s)", d.petsTotal);
    }
    if (d.extrasTotal > 0) line("Extras", d.extrasTotal);
    if (d.cleaningFee > 0) line("Limpieza", d.cleaningFee);
    if (d.guarantee && d.guarantee > 0) line("Garantia reembolsable", d.guarantee);

    hr();
    y -= 14;
    text("TOTAL", { size: 11, font: bold });
    textRight(money(d.total), 11, bold);
    y -= 16;

    const method = PAY_METHOD_LABEL[d.paymentMethod] ?? d.paymentMethod;
    line(`Pagado a la fecha (${method})`, -Math.abs(d.depositPaid));
    if (d.fullyPaid || d.depositPaid >= d.total) {
      text("PAGADO COMPLETO", { size: 11, font: bold, color: BRAND });
      textRight(money(0) + "  ✓".replace("✓", ""), 11, bold, BRAND);
    } else {
      text("SALDO PENDIENTE", { size: 11, font: bold, color: BRAND });
      textRight(money(Math.max(0, d.total - d.depositPaid)), 11, bold, BRAND);
    }
    y -= 26;

    // ── Instrucciones y políticas ──
    text("TU LLEGADA", { size: 8, font: bold, color: MUTED });
    y -= 13;
    const checkinPolicy = (d.fullyPaid || d.depositPaid >= d.total)
      ? CHECKIN_POLICY
      : [...CHECKIN_POLICY, CHECKIN_SALDO];
    for (const l of checkinPolicy) { text(`· ${l}`, { size: 9 }); y -= 12; }
    y -= 8;
    text("POLITICAS DE LA CASA", { size: 8, font: bold, color: MUTED });
    y -= 13;
    for (const l of HOUSE_POLICY) { text(`· ${l}`, { size: 9 }); y -= 12; }

    // ── Pie ──
    y = 64;
    hr();
    y -= 10;
    text("Este documento es un recibo de confirmacion de reserva. No constituye factura electronica (SRI).", { size: 7.5, color: MUTED });
    y -= 10;
    text(`Emitido el ${fmtDate(new Date().toISOString().slice(0, 10))} · ${SITE.email} · WhatsApp ${SITE.whatsappDisplay}`, { size: 7.5, color: MUTED });

    return doc.save();
  }
}

/** Generador activo (cambiar aquí cuando exista el facturador SRI). */
export const receiptGenerator: ReceiptGenerator = new PdfReceiptGenerator();

/**
 * Genera el recibo, lo sube al bucket privado `receipts` y guarda la ruta
 * en reservations.receipt_path. Devuelve la ruta o null si algo falla
 * (nunca lanza: el recibo no debe bloquear la confirmación).
 */
export async function generateAndStoreReceipt(
  db: SupabaseClient,
  data: ReceiptData
): Promise<{ path: string; bytes: Uint8Array } | null> {
  try {
    const bytes = await receiptGenerator.generate(data);
    const path = `${data.reservationId}/recibo-${data.reservationId.slice(0, 8)}.pdf`;
    const { error } = await db.storage
      .from("receipts")
      .upload(path, Buffer.from(bytes), { contentType: "application/pdf", upsert: true });
    if (error) {
      console.error("[receipt] upload:", error.message);
      return { path: "", bytes }; // sin Storage igual podemos adjuntarlo al email
    }
    await db.from("reservations").update({ receipt_path: path }).eq("id", data.reservationId);
    return { path, bytes };
  } catch (e) {
    console.error("[receipt] generación falló:", (e as Error).message);
    return null;
  }
}
