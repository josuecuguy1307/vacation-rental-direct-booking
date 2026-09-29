import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UPDATABLE = [
  "name", "date_start", "date_end",
  "weekday_price_cents", "weekend_price_cents", "priority",
] as const;

/** Valida fecha YYYY-MM-DD real (rechaza 2026-02-30, formatos raros, etc.). */
function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(value + "T00:00:00Z");
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

/**
 * PATCH /api/admin/seasons/[id] — actualiza campos de la temporada.
 * Para validar date_end > date_start con updates parciales se lee la fila
 * actual y se fusiona antes de validar (date_end sigue siendo EXCLUSIVO).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const key of UPDATABLE) {
    if (key in body) updates[key] = body[key];
  }
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  if ("name" in updates) {
    if (typeof updates.name !== "string" || !updates.name.trim()) {
      return NextResponse.json({ error: "name no puede estar vacío" }, { status: 400 });
    }
    updates.name = updates.name.trim();
  }
  for (const key of ["date_start", "date_end"] as const) {
    if (key in updates && (typeof updates[key] !== "string" || !isValidDate(updates[key] as string))) {
      return NextResponse.json(
        { error: `${key} debe ser una fecha YYYY-MM-DD válida` },
        { status: 400 }
      );
    }
  }
  for (const key of ["weekday_price_cents", "weekend_price_cents"] as const) {
    if (key in updates &&
        (!Number.isInteger(updates[key]) || (updates[key] as number) <= 0)) {
      return NextResponse.json(
        { error: `${key} debe ser un entero > 0 (centavos)` },
        { status: 400 }
      );
    }
  }
  if ("priority" in updates && !Number.isInteger(updates.priority)) {
    return NextResponse.json({ error: "priority debe ser un entero" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // Fila actual: necesaria para validar las fechas fusionadas en updates parciales
  const { data: current, error: readError } = await db
    .from("seasons")
    .select("date_start, date_end")
    .eq("id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Temporada no encontrada" }, { status: 404 });

  const dateStart = (updates.date_start as string | undefined) ?? current.date_start;
  const dateEnd = (updates.date_end as string | undefined) ?? current.date_end;
  if (dateEnd <= dateStart) {
    return NextResponse.json(
      { error: "date_end debe ser posterior a date_start (date_end es exclusivo)" },
      { status: 400 }
    );
  }

  const { data, error } = await db
    .from("seasons")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Temporada no encontrada" }, { status: 404 });
  return NextResponse.json({ season: data });
}

/**
 * DELETE /api/admin/seasons/[id] — borrado real: las reservas guardan su
 * price_breakdown como snapshot, no referencian seasons.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const { error } = await supabaseAdmin().from("seasons").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
