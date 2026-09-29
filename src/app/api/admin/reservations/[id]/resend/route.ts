import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildVars } from "@/lib/messaging/send";
import { renderTemplate, TEMPLATES, type TemplateKey } from "@/lib/messaging/templates";
import { getDuena, getEffectiveTemplates, logAudit } from "@/lib/panel";
import { sendBrandedEmail } from "@/lib/notifications/email";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reservations/[id]/resend — reenvía POR EMAIL un mensaje
 * concreto del timeline (módulo B: "reenviar correo X"). No toca el
 * timeline programado: es un envío puntual, auditado.
 * Body: { template_key }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;
  const actor = auth.user.email ?? "panel";

  const { id } = await params;
  let body: { template_key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const key = body.template_key as TemplateKey | undefined;
  if (!key || !(key in TEMPLATES)) {
    return NextResponse.json(
      { error: `template_key debe ser uno de: ${Object.keys(TEMPLATES).join(", ")}` },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  const { data: r } = await db
    .from("reservations")
    .select("id, status, guest_name, guest_email, guest_phone, check_in, check_out, num_guests, total, deposit_amount, balance_due_cents, payment_status, receipt_path, properties(name, check_in_time, check_out_time, wifi_name, wifi_password)")
    .eq("id", id)
    .single();
  if (!r) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

  const [templates, duena] = await Promise.all([getEffectiveTemplates(db), getDuena(db)]);
  const tpl = templates[key];
  const vars = buildVars(r, { reviewFallback: duena.review_link });

  // la confirmación va con su recibo PDF adjunto, como el envío original
  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (key === "confirmacion" && r.receipt_path) {
    const { data: file } = await db.storage.from("receipts").download(r.receipt_path);
    if (file) attachments = [{ filename: `Recibo-${SITE.slug}.pdf`, content: Buffer.from(await file.arrayBuffer()) }];
  }

  try {
    await sendBrandedEmail({
      to: r.guest_email,
      subject: renderTemplate(tpl.asunto, vars),
      text: renderTemplate(tpl.email, vars),
      metaLine: `Reserva ${vars.codigo} · ${r.check_in} → ${r.check_out}`,
      attachments,
    });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo enviar: ${(e as Error).message}` }, { status: 502 });
  }

  logAudit(db, {
    actor, action: "reenviar_email", entity: "reservation", entityId: id,
    detail: { template_key: key, to: r.guest_email },
  }).catch(() => {});

  return NextResponse.json({ ok: true, enviado_a: r.guest_email });
}
