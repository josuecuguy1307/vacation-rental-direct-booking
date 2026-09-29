import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { logAudit } from "@/lib/panel";
import { requireEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const MAX_FAILS = 5;
const BLOCK_MIN = 15;

/**
 * POST /api/panel/login — login del panel con RATE LIMIT server-side:
 * 5 intentos fallidos por IP → bloqueo 15 minutos. La sesión la emite
 * Supabase Auth (expira sola); el cliente la guarda y la manda como
 * Bearer a /api/admin/* (validación server-side en cada request).
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ?? "local";

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body.email || !body.password) {
    return NextResponse.json({ error: "Email y contraseña requeridos" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // rate limit por IP: fallos en los últimos 15 min
  const since = new Date(Date.now() - BLOCK_MIN * 60_000).toISOString();
  const { count } = await db
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("ok", false)
    .gt("created_at", since);
  if ((count ?? 0) >= MAX_FAILS) {
    return NextResponse.json(
      { error: `Demasiados intentos. Espera ${BLOCK_MIN} minutos.` },
      { status: 429 }
    );
  }

  // login contra Supabase Auth (cliente anónimo, server-side)
  const anon = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });

  await db.from("login_attempts").insert({ ip, ok: !error });

  if (error || !data.session) {
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }

  logAudit(db, {
    actor: body.email, action: "login", entity: "panel",
    detail: { ip },
  }).catch(() => {});

  return NextResponse.json({
    access_token: data.session.access_token,
    expires_at: data.session.expires_at,   // unix seconds — el panel re-pide login al vencer
    email: data.user?.email,
  });
}
