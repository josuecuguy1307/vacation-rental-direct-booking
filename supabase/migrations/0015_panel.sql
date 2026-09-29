-- Plantilla de reservas — panel de la dueña (Etapa 20)
-- 0015: auditoría de mutaciones, rate limit de login y settings editables
-- (overrides de plantillas/timeline, datos bancarios, contacto de la dueña).

-- ── audit_log: quién hizo qué y cuándo (toda mutación del panel) ──
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,                 -- email del usuario del panel
  action text not null,               -- 'confirmar_pago' | 'editar_plantilla' | ...
  entity text not null,               -- 'reservation' | 'settings' | 'season' | ...
  entity_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on audit_log (created_at desc);
alter table audit_log enable row level security;
create policy "admin read audit log" on audit_log for select to authenticated using (true);

-- ── login_attempts: 5 fallos en 15 min → bloqueo ──
create table if not exists login_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  ok boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists login_attempts_ip_idx on login_attempts (ip, created_at desc);
alter table login_attempts enable row level security;  -- solo service role

-- ── app_settings: configuración editable desde el panel ──
--   'templates'     → overrides de plantillas (las del código son el default inmutable)
--   'timeline'      → offsets/horas/toggles de los mensajes programados
--   'banco'         → cuenta bancaria para las instrucciones de transferencia
--   'duena'         → email/whatsapp de notificaciones + digest + review_link
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
create policy "admin read settings" on app_settings for select to authenticated using (true);
