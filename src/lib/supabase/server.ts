import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

const HINT_URL =
  'Your Supabase project URL (Project Settings → API → Project URL), e.g. "https://YOUR-PROJECT.supabase.co".';

/**
 * Cliente con service role — SOLO en servidor (route handlers / cron).
 * Salta RLS: úsalo donde la lógica de negocio ya valida (precios, estados).
 */
export function supabaseAdmin(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL", HINT_URL),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY", "The service_role key (Project Settings → API). It is SECRET: server only."),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/** Cliente anónimo (respeta RLS). Para lecturas públicas. */
export function supabaseAnon(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL", HINT_URL),
    requireEnv("SUPABASE_ANON_KEY", "The anon/public key (Project Settings → API)."),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * Cliente atado al JWT del request (respeta RLS como ese usuario).
 * Para endpoints admin: el frontend manda `Authorization: Bearer <access_token>`.
 */
export function supabaseFromToken(accessToken: string): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL", HINT_URL),
    requireEnv("SUPABASE_ANON_KEY", "The anon/public key (Project Settings → API)."),
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
