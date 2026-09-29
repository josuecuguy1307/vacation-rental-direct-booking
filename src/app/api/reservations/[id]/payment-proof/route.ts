import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { makeOwnerActionToken, notifyOwnerEvent } from "@/lib/owner-notify";
import { escapeHtml } from "@/lib/html";
import { SITE } from "@/config/site.config";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB (límite del bucket)
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
};

/**
 * POST /api/reservations/[id]/payment-proof
 * El huésped envía su comprobante de transferencia (multipart, campo "file").
 * El servidor lo sube al bucket privado 'payment-proofs' y marca
 * payment_status='review' para que el admin verifique y confirme.
 * (subida del comprobante, server-side.)
 *
 * También acepta el modo legacy JSON { storage_path } si el frontend
 * subió directo a Storage.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: reservation } = await db
    .from("reservations")
    .select("id, status, payment_status")
    .eq("id", id)
    .single();
  if (!reservation) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }
  if (reservation.status === "cancelled") {
    return NextResponse.json({ error: "La reserva está cancelada" }, { status: 409 });
  }

  let path: string;
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    // ── Subida directa del archivo ──────────────────────
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo (campo 'file')" }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: "Formato no permitido (usa JPG, PNG, WebP o PDF)" },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "El archivo supera 5 MB" }, { status: 400 });
    }

    path = `${id}/comprobante-${Date.now()}.${EXT[file.type]}`;
    const { error: uploadErr } = await db.storage
      .from("payment-proofs")
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
        upsert: true,
      });
    if (uploadErr) {
      console.error("[payment-proof] upload:", uploadErr);
      return NextResponse.json({ error: "No se pudo subir el comprobante" }, { status: 500 });
    }
  } else {
    // ── Modo legacy: el frontend ya subió a Storage ─────
    let body: { storage_path?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const p = body.storage_path?.trim();
    if (!p || !p.startsWith(`${id}/`)) {
      return NextResponse.json(
        { error: "storage_path debe estar dentro de la carpeta de la reserva" },
        { status: 400 }
      );
    }
    const [folder, ...rest] = p.split("/");
    const { data: files } = await db.storage.from("payment-proofs").list(folder);
    if (!files?.some((f) => f.name === rest.join("/"))) {
      return NextResponse.json({ error: "Archivo no encontrado en Storage" }, { status: 400 });
    }
    path = p;
  }

  const { error } = await db
    .from("reservations")
    .update({ payment_proof_url: path, payment_status: "review" })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Error al registrar comprobante" }, { status: 500 });
  }

  // ── Aviso a la DUEÑA con el comprobante y botones firmados (Etapa 19-B):
  //    confirmar/rechazar directo desde el email, sin login ──
  try {
    const { data: r } = await db
      .from("reservations")
      .select("guest_name, guest_email, guest_phone, check_in, check_out, num_guests, total, deposit_amount")
      .eq("id", id)
      .single();
    const { data: signed } = await db.storage
      .from("payment-proofs")
      .createSignedUrl(path, 60 * 60 * 72); // 72 h
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? req.nextUrl.origin;
    const codigo = `${SITE.bookingCodePrefix}-${id.slice(0, 8).toUpperCase()}`;
    const okUrl = `${base}/api/owner/decision/${makeOwnerActionToken(id, "confirmar")}`;
    const noUrl = `${base}/api/owner/decision/${makeOwnerActionToken(id, "rechazar")}`;

    const btn = (url: string, label: string, bg: string) =>
      `<a href="${url}" style="display:inline-block;margin:6px;padding:13px 26px;background:${bg};color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">${label}</a>`;

    notifyOwnerEvent({
      titulo: `Comprobante recibido — ${codigo}`,
      emoji: "🧾",
      tipo: "pago",
      lineas: [
        `Huésped: ${r?.guest_name} (${r?.guest_email}${r?.guest_phone ? ` · ${r.guest_phone}` : ""})`,
        `Fechas: ${r?.check_in} → ${r?.check_out} · ${r?.num_guests} huésped(es)`,
        `A confirmar: $${Number(r?.deposit_amount ?? 0).toFixed(2)} de $${Number(r?.total ?? 0).toFixed(2)}`,
        ...(signed?.signedUrl ? [`Comprobante: ${signed.signedUrl}`] : []),
        `Confirmar: ${okUrl}`,
        `Rechazar: ${noUrl}`,
      ],
      html: `
        <p style="margin:0 0 14px;line-height:1.6"><b>${escapeHtml(r?.guest_name)}</b> subió el comprobante de transferencia de la reserva <b>${codigo}</b> (${escapeHtml(r?.check_in)} → ${escapeHtml(r?.check_out)}, ${escapeHtml(r?.num_guests)} huésped/es).</p>
        <p style="margin:0 0 14px;line-height:1.6">Monto a confirmar: <b>$${Number(r?.deposit_amount ?? 0).toFixed(2)}</b> de $${Number(r?.total ?? 0).toFixed(2)} totales.</p>
        ${signed?.signedUrl ? `<p style="margin:0 0 18px"><a href="${signed.signedUrl}" style="color:#7B473A;font-weight:bold">📎 Ver comprobante</a> (link válido 72 h)</p>` : ""}
        <div style="text-align:center;margin:10px 0 6px">
          ${btn(okUrl, "✓ Confirmar pago recibido", "#2E3A2E")}
          ${btn(noUrl, "✗ Rechazar", "#a04030")}
        </div>
        <p style="margin:10px 0 0;font-size:12px;color:#8a7f6b;text-align:center">Botones de un solo uso, válidos 72 horas, sin necesidad de iniciar sesión.</p>`,
    }).catch(() => {});
  } catch (e) {
    console.error("[payment-proof] aviso dueña:", e);
  }

  return NextResponse.json({
    ok: true,
    message: "Comprobante recibido. Confirmaremos tu reserva en las próximas horas.",
  });
}
