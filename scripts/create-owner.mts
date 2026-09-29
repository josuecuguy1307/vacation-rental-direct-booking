/**
 * Crea (o resetea la clave de) la usuaria del panel — Etapa 20.
 * El signup público NO se usa: este script es la única vía de alta.
 *
 *   npx tsx scripts/create-owner.mts <email> [password]
 *
 * Sin password genera una clave fuerte y la imprime UNA vez.
 * Marca al usuario como admin (app_metadata.role = 'admin'), que es lo que exigen
 * las políticas RLS de la migración 0018. Recuerda agregar el email a ADMIN_EMAILS.
 * Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local.
 */
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

nextEnv.loadEnvConfig(process.cwd());

const email = process.argv[2];
if (!email || !email.includes("@")) {
  console.error("Uso: npx tsx scripts/create-owner.mts <email> [password]");
  process.exit(1);
}

// clave legible pero fuerte: 4 bloques base32-ish separados por guiones
function strongPassword(): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const block = () =>
    Array.from(randomBytes(4)).map((b) => abc[b % abc.length]).join("");
  return `${block()}-${block()}-${block()}-${block()}`;
}

const password = process.argv[3] ?? strongPassword();

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v || /^TU_.*_AQUI$/i.test(v) || v.includes("TU-PROYECTO")) {
    console.error(`Missing ${name}. Copy .env.example to .env.local and fill in your own keys (see README).`);
    process.exit(1);
  }
  return v;
}

const db = createClient(need("SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: created, error } = await db.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { role: "admin" },
});

if (error) {
  if (/already.*registered|already exists/i.test(error.message)) {
    // ya existe → reset de clave
    const { data: list } = await db.auth.admin.listUsers();
    const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) throw new Error("Existe pero no se encontró al listar usuarios");
    const { error: e2 } = await db.auth.admin.updateUserById(user.id, {
      password,
      app_metadata: { ...user.app_metadata, role: "admin" },
    });
    if (e2) throw e2;
    console.log(`✓ Usuario existente — clave RESETEADA`);
  } else {
    throw error;
  }
} else {
  console.log(`✓ Usuario creado (id ${created.user?.id})`);
}

console.log(`
──────────────────────────────────────────────
  CREDENCIALES DEL PANEL (guárdalas y pásalas)
  Email:    ${email}
  Clave:    ${password}
──────────────────────────────────────────────
No olvides: ADMIN_EMAILS=${email} en .env.local y Vercel.
`);
