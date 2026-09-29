import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";

export type AdminContext = { user: User; accessToken: string };

/**
 * Verifica que el request traiga un JWT válido de Supabase Auth.
 * Modelo de un solo dueño: además del JWT, el email debe estar en
 * ADMIN_EMAILS (lista separada por comas) — así, aunque el signup
 * público de Supabase quedara abierto por error, un usuario extraño
 * NO pasa. Sin ADMIN_EMAILS configurado nadie pasa (falla cerrado).
 *
 * Devuelve el contexto admin o un NextResponse 401 listo para retornar.
 */
export async function requireAdmin(
  req: NextRequest
): Promise<AdminContext | NextResponse> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: "Token inválido o expirado" }, { status: 401 });
  }

  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  // Falla CERRADO: sin ADMIN_EMAILS nadie es admin (antes, vacío = cualquier usuario autenticado).
  if (!allowed.length) {
    console.error("[auth] ADMIN_EMAILS is not set: admin access denied");
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!allowed.includes((data.user.email ?? "").toLowerCase())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return { user: data.user, accessToken: token };
}

export function isAuthError(
  result: AdminContext | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
