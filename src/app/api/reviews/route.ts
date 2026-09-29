import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { todayInPropertyTz } from "@/lib/dates";
import { notifyOwnerEvent } from "@/lib/owner-notify";
import { computeReviewStats, reviewSchema, verifyReviewToken } from "@/lib/reviews";
import { firstIssue } from "@/lib/booking-schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/reviews — SOLO reseñas published (las pending/rejected jamás
 * salen por aquí) + promedios para el encabezado estilo Airbnb.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from("reviews")
    .select("id, display_name, guest_name, rating_overall, rating, comment, date, created_at, limpieza, veracidad, llegada, comunicacion, ubicacion, calidad_precio")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "No se pudieron cargar las reseñas" }, { status: 500 });
  }

  const reviews = (data ?? []).map((r) => ({
    id: r.id,
    name: r.display_name ?? r.guest_name,
    rating_overall: Number(r.rating_overall ?? r.rating),
    limpieza: r.limpieza,
    veracidad: r.veracidad,
    llegada: r.llegada,
    comunicacion: r.comunicacion,
    ubicacion: r.ubicacion,
    calidad_precio: r.calidad_precio,
    comment: r.comment,
    date: r.date ?? String(r.created_at).slice(0, 10),
  }));

  return NextResponse.json({ stats: computeReviewStats(reviews), reviews });
}

/**
 * POST /api/reviews — crea la reseña de una reserva (status pending).
 * - El token firmado identifica la reserva; solo quien se hospedó lo tiene
 *   (viaja en el mensaje "después de la salida" del timeline).
 * - Una reseña por reserva: el UNIQUE de reservation_id devuelve 409 si ya
 *   existe ("ya dejaste tu evaluación").
 * - Al crear: WhatsApp al dueño para moderar desde el admin.
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }
  const body = parsed.data;

  const reservationId = verifyReviewToken(body.token);
  if (!reservationId) {
    return NextResponse.json({ error: "El link de evaluación no es válido" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: reservation } = await db
    .from("reservations")
    .select("id, property_id, status, check_out")
    .eq("id", reservationId)
    .single();
  if (!reservation) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }
  if (!["confirmed", "completed"].includes(reservation.status)) {
    return NextResponse.json({ error: "Esta reserva no admite evaluación" }, { status: 403 });
  }
  if (reservation.check_out > todayInPropertyTz()) {
    return NextResponse.json(
      { error: "Tu evaluación se habilita después de tu salida" },
      { status: 403 }
    );
  }

  const { error: insertErr } = await db.from("reviews").insert({
    property_id: reservation.property_id,
    reservation_id: reservation.id,
    guest_name: body.display_name,
    display_name: body.display_name,
    rating_overall: body.rating_overall,
    rating: body.rating_overall,   // columna legacy not-null
    limpieza: body.limpieza,
    veracidad: body.veracidad,
    llegada: body.llegada,
    comunicacion: body.comunicacion,
    ubicacion: body.ubicacion,
    calidad_precio: body.calidad_precio,
    comment: body.comment,
    status: "pending",
    approved: false,               // columna legacy
  });

  if (insertErr) {
    if (insertErr.code === "23505") {
      return NextResponse.json(
        { error: "Ya dejaste tu evaluación de esta estadía — ¡gracias!" },
        { status: 409 }
      );
    }
    console.error("[reviews] insert:", insertErr);
    return NextResponse.json({ error: "No se pudo guardar tu evaluación" }, { status: 500 });
  }

  // moderación: aviso a la dueña (no bloquea la respuesta)
  notifyOwnerEvent({
    titulo: "Nueva reseña pendiente de moderar",
    emoji: "🌟",
    lineas: [
      `${body.display_name}: ${body.rating_overall}⭐`,
      `"${body.comment.slice(0, 120)}${body.comment.length > 120 ? "…" : ""}"`,
      "Revisar y publicar desde el admin.",
    ],
  }).catch(() => {});

  return NextResponse.json({ ok: true, status: "pending" }, { status: 201 });
}
