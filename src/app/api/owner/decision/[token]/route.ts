import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyOwnerActionToken, type OwnerAction } from "@/lib/owner-notify";
import { confirmReservation } from "@/lib/reservations";
import { sendBrandedEmail } from "@/lib/notifications/email";
import { escapeHtml } from "@/lib/html";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

/** Página mínima de resultado para la dueña (sin login). `extra` es HTML propio, ya seguro. */
const page = (titulo: string, detalle: string, ok = true, extra = "") =>
  new NextResponse(
    `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(titulo)} · ${SITE.name}</title></head>
<body style="font-family:Georgia,serif;background:#efe9dd;margin:0;padding:40px 16px">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:34px;text-align:center;color:#3C2B23">
<div style="font-size:44px">${ok ? "✅" : "⚠️"}</div>
<h2 style="margin:12px 0">${escapeHtml(titulo)}</h2>
<p style="line-height:1.6;color:#6f6450">${escapeHtml(detalle)}</p>
${extra}
</div></body></html>`,
    {
      status: ok ? 200 : 400,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
      },
    }
  );

const LABEL: Record<OwnerAction, { boton: string; color: string }> = {
  confirmar: { boton: "✓ Sí, confirmar pago recibido", color: "#2E3A2E" },
  rechazar: { boton: "✗ Sí, rechazar comprobante", color: "#a04030" },
};

type Loaded =
  | { kind: "page"; res: NextResponse }
  | {
      kind: "ok";
      action: OwnerAction;
      r: {
        id: string; status: string; payment_status: string; guest_name: string;
        guest_email: string; check_in: string; check_out: string; total: number;
      };
      codigo: string;
    };

/** Valida token + estado. Común a GET (vista previa) y POST (acción). */
async function load(token: string): Promise<Loaded> {
  let parsed: ReturnType<typeof verifyOwnerActionToken>;
  try {
    parsed = verifyOwnerActionToken(token);
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return { kind: "page", res: page("Link no válido", "Este link no es correcto o está incompleto.", false) };
  }
  if (parsed.expired) {
    return {
      kind: "page",
      res: page("Link vencido", "Este link venció (duran 72 horas). Revisa y confirma la reserva desde el panel.", false),
    };
  }

  const { data: r } = await supabaseAdmin()
    .from("reservations")
    .select("id, status, payment_status, guest_name, guest_email, check_in, check_out, total")
    .eq("id", parsed.reservationId)
    .single();
  if (!r) return { kind: "page", res: page("Reserva no encontrada", "El link no corresponde a una reserva.", false) };

  const codigo = `${SITE.bookingCodePrefix}-${r.id.slice(0, 8).toUpperCase()}`;

  if (r.status === "confirmed") {
    return parsed.action === "confirmar"
      ? { kind: "page", res: page("Ya estaba confirmada", `La reserva ${codigo} de ${r.guest_name} ya fue confirmada antes — este link era de un solo uso.`) }
      : { kind: "page", res: page("Ya estaba confirmada", `La reserva ${codigo} ya fue confirmada — no se puede rechazar desde este link. Hazlo desde el panel si es necesario.`, false) };
  }
  // Ambas acciones exigen un comprobante EN REVISIÓN: así un link de
  // "confirmar" no revive un comprobante que ya se rechazó.
  if (r.payment_status !== "review") {
    return {
      kind: "page",
      res: page("Nada pendiente", `La reserva ${codigo} no tiene un comprobante en revisión (este link era de un solo uso). Revísala desde el panel.`),
    };
  }
  return { kind: "ok", action: parsed.action, r, codigo };
}

/**
 * GET /api/owner/decision/[token] — link del email de la dueña, SIN login.
 * Solo MUESTRA la decisión con un botón: los escáneres de enlaces de los
 * clientes de correo abren los links (GET) y no deben poder confirmar pagos.
 * El token HMAC firma (reserva, acción, vencimiento).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const l = await load(token);
  if (l.kind === "page") return l.res;

  const { boton, color } = LABEL[l.action];
  const form = `<form method="post" style="margin-top:18px">
<button type="submit" style="padding:13px 26px;background:${color};color:#fff;border:0;border-radius:8px;font-weight:bold;font-size:15px;cursor:pointer">${boton}</button>
</form>`;
  return page(
    l.action === "confirmar" ? "¿Confirmar el pago?" : "¿Rechazar el comprobante?",
    `Reserva ${l.codigo} de ${l.r.guest_name} (${l.r.check_in} → ${l.r.check_out}).`,
    true,
    form
  );
}

/** POST — ejecuta la acción (el botón de la página del GET). */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const l = await load(token);
  if (l.kind === "page") return l.res;
  const { r, codigo } = l;

  if (l.action === "confirmar") {
    const result = await confirmReservation(r.id, { paymentMethod: "bank_transfer" });
    if (!result.ok) return page("No se pudo confirmar", result.error ?? "Inténtalo desde el panel.", false);
    return page(
      "¡Pago confirmado!",
      `La reserva ${codigo} de ${r.guest_name} (${r.check_in} → ${r.check_out}) quedó CONFIRMADA. El huésped ya recibió su confirmación con el recibo, y el timeline de mensajes quedó programado.`
    );
  }

  // rechazar
  await supabaseAdmin().from("reservations").update({ payment_status: "unpaid" }).eq("id", r.id);
  sendBrandedEmail({
    to: r.guest_email,
    subject: `Sobre tu comprobante · ${codigo} · ${SITE.name}`,
    text: `Hola ${r.guest_name.split(" ")[0]},

Revisamos el comprobante de tu reserva ${codigo} y no pudimos validarlo. Tranquilo: tus fechas siguen apartadas por unas horas.

Por favor verifica los datos de la transferencia y vuelve a subir el comprobante desde la página de reserva, o escríbenos por WhatsApp y lo resolvemos juntos.`,
  }).catch(() => {});
  return page(
    "Comprobante rechazado",
    `Le avisamos a ${r.guest_name} por email para que verifique su transferencia y vuelva a intentarlo. La reserva ${codigo} sigue pendiente.`
  );
}
