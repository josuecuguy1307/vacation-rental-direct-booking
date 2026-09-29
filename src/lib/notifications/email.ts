import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { escapeHtml } from "@/lib/html";
import { optionalEnv, requireEnv, siteBaseUrl } from "@/lib/env";
import { SITE } from "@/config/site.config";

export type ReservationEmailData = {
  id: string;
  guest_name: string;
  guest_email: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  total: number;
  deposit_amount: number;
  property_name: string;
};

const FROM = () =>
  requireEnv("EMAIL_FROM", 'Sender of your emails, e.g. "My House <bookings@your-domain.com>" (must be verified with your provider).');
const OWNER = () => process.env.OWNER_EMAIL ?? "";

/* ── Transporte intercambiable (Etapa post-test): EMAIL_PROVIDER=resend|smtp.
   SMTP genérico (nodemailer) para usar Gmail con contraseña de aplicación
   mientras tu dominio no esté verificado en Resend — al verificarlo se
   flipea la env var de vuelta sin tocar código. Mismos templates y PDFs. */

function resend(): Resend | null {
  const key = optionalEnv("RESEND_API_KEY");
  return key ? new Resend(key) : null;
}

let smtpTransport: Transporter | null = null;
function smtp(): Transporter {
  if (!smtpTransport) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    smtpTransport = nodemailer.createTransport({
      host: optionalEnv("SMTP_HOST"),
      port,
      secure: port === 465, // 465 = SSL implícito; 587 usaría STARTTLS
      auth: { user: optionalEnv("SMTP_USER"), pass: optionalEnv("SMTP_PASS") },
    });
  }
  return smtpTransport;
}

export type RawEmail = {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
};

/** Envío de bajo nivel por el provider activo. LANZA si falla. */
export async function sendRawEmail(msg: RawEmail): Promise<void> {
  if (process.env.EMAIL_PROVIDER === "smtp") {
    if (!optionalEnv("SMTP_HOST") || !optionalEnv("SMTP_USER") || !optionalEnv("SMTP_PASS")) {
      throw new Error("SMTP is not configured: set SMTP_HOST / SMTP_USER / SMTP_PASS (see .env.example)");
    }
    await smtp().sendMail({
      from: FROM(),
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      attachments: msg.attachments,
    });
    return;
  }
  const client = resend();
  if (!client) throw new Error("RESEND_API_KEY is not set (see .env.example)");
  const { error } = await client.emails.send({
    from: FROM(),
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    attachments: msg.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content.toString("base64"),
    })),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

/* ── Mensajería al huésped (Etapa 11) ─────────────────────── */

/**
 * Envuelve texto plano (párrafos separados por \n\n) en el branding del
 * sitio: logo real de la propiedad en la cabecera (URL absoluta — los
 * clientes de correo no resuelven rutas relativas) y firma del anfitrión.
 */
export function brandedHtml(text: string, rawHtml?: string, metaLine?: string): string {
  const base = siteBaseUrl();
  const paragraphs = rawHtml ?? text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `
  <div style="background:#efe9dd;padding:28px 12px">
    <div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#3C2B23;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4dcc9">
      <div style="background:#E3DAC6;padding:26px 28px 18px;text-align:center">
        <img src="${base}/assets/logos/logo-crema.png" alt="${SITE.name}" width="132"
          style="display:inline-block;width:132px;height:auto" />
        ${metaLine ? `<div style="margin-top:10px;font-size:12px;letter-spacing:.06em;color:#7B473A;font-weight:bold">${metaLine}</div>` : ""}
      </div>
      <div style="padding:30px 28px 8px;font-size:15px">${paragraphs}</div>
      <div style="padding:0 28px 26px;font-size:14px;color:#7B473A">
        <strong>${SITE.hostSignature} de ${SITE.name}</strong> 🌿
      </div>
      <div style="background:#2E3A2E;padding:16px 28px;font-size:12px;color:#E3DAC6;text-align:center">
        ${SITE.name} · ${SITE.address}<br/>
        <a href="https://wa.me/${SITE.whatsapp}" style="color:#E3DAC6">WhatsApp ${SITE.whatsappDisplay}</a>
        ${SITE.instagram ? `&nbsp;·&nbsp;
        <a href="https://instagram.com/${SITE.instagram}" style="color:#E3DAC6">@${SITE.instagram}</a>` : ""}
      </div>
    </div>
  </div>`;
}

export type BrandedEmail = {
  to: string;
  subject: string;
  text: string;       // texto plano de templates.ts; aquí se convierte a HTML
  html?: string;      // HTML interno ya armado (p.ej. tabla del recibo de snacks)
  metaLine?: string;  // "Reserva CB-XXXX · 2026-07-10 → 2026-07-13" bajo el logo
  attachments?: Array<{ filename: string; content: Buffer }>;
};

/**
 * Email al huésped con branding. A diferencia de las notificaciones al
 * dueño, LANZA si falla: el scheduler de mensajes usa el error para
 * reintentar (máx 3) y dejar last_error.
 */
export async function sendBrandedEmail(msg: BrandedEmail): Promise<void> {
  await sendRawEmail({
    to: msg.to,
    subject: msg.subject,
    html: brandedHtml(msg.text, msg.html, msg.metaLine),
    attachments: msg.attachments,
  });
}

function ownerHtml(r: ReservationEmailData): string {
  return `
  <div style="font-family:sans-serif;max-width:560px">
    <h2>Nueva reserva confirmada — ${escapeHtml(r.property_name)}</h2>
    <ul>
      <li><strong>Huésped:</strong> ${escapeHtml(r.guest_name)} (${escapeHtml(r.guest_email)})</li>
      <li><strong>Fechas:</strong> ${escapeHtml(r.check_in)} → ${escapeHtml(r.check_out)}</li>
      <li><strong>Huéspedes:</strong> ${r.num_guests}</li>
      <li><strong>Total:</strong> $${r.total.toFixed(2)}${r.deposit_amount < r.total ? ` (anticipo $${r.deposit_amount.toFixed(2)})` : " (pagado completo)"}</li>
      <li><strong>ID:</strong> ${r.id}</li>
    </ul>
  </div>`;
}

/**
 * Correo de confirmación al DUEÑO. No lanza: loguea y sigue.
 * (El correo al huésped ahora sale del timeline de scheduled_messages —
 * plantilla 'confirmacion' con el recibo PDF adjunto.)
 */
export async function sendOwnerConfirmationEmail(r: ReservationEmailData): Promise<void> {
  if (!OWNER()) return;
  try {
    await sendRawEmail({
      to: OWNER(),
      subject: `[${SITE.name}] Nueva reserva: ${r.guest_name} ${r.check_in} → ${r.check_out}`,
      html: ownerHtml(r),
    });
  } catch (e) {
    console.error("[email] fallo al enviar al dueño:", e);
  }
}
