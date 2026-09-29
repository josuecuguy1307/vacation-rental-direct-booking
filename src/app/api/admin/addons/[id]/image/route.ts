import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const BUCKET = "addon-images";

/**
 * POST /api/admin/addons/[id]/image — sube/reemplaza la foto de un addon.
 * multipart/form-data, campo "file" (JPG/PNG/WebP ≤ 5 MB). La imagen va a un
 * bucket PÚBLICO 'addon-images' (se autocrea la primera vez, sin migración) y
 * su URL pública queda en addons.image_url — que /snacks ya renderiza. Solo
 * admin (mismo patrón server-side que payment-proof).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Envía la imagen como multipart/form-data (campo 'file')" },
      { status: 400 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo (campo 'file')" }, { status: 400 });
  }
  if (!EXT[file.type]) {
    return NextResponse.json({ error: "Formato no permitido (usa JPG, PNG o WebP)" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "La imagen supera 5 MB" }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { data: addon } = await db.from("addons").select("id").eq("id", id).maybeSingle();
  if (!addon) {
    return NextResponse.json({ error: "Addon no encontrado" }, { status: 404 });
  }

  // Bucket público autocreado (idempotente: si ya existe, el error se ignora).
  try {
    await db.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
  } catch {
    /* ya existe u otro estado no bloqueante — el upload de abajo confirma */
  }

  const path = `${id}/${Date.now()}.${EXT[file.type]}`;
  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });
  if (upErr) {
    console.error("[addon-image] upload:", upErr);
    return NextResponse.json({ error: "No se pudo subir la imagen" }, { status: 500 });
  }

  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);
  const image_url = pub.publicUrl;

  const { error: updErr } = await db.from("addons").update({ image_url }).eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: "No se pudo guardar la imagen" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, image_url });
}
