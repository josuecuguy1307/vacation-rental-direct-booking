-- Plantilla de reservas — mensajería automatizada al huésped + recibos PDF (Etapa 11)
-- 0008: timeline de mensajes estilo Airbnb (email + WhatsApp), wifi de la
-- propiedad para el mensaje de llegada, y bucket privado para los recibos.

-- ─────────────────────────────────────────────
-- scheduled_messages — un mensaje programado por
-- (reserva, plantilla, canal). El cron de 15 min envía los vencidos.
-- ─────────────────────────────────────────────
create table if not exists scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  template_key text not null,   -- confirmacion | antes_llegada | despues_primera_noche | antes_salida | despues_salida
  channel text not null,        -- email | whatsapp
  send_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'pending',  -- pending | sent | failed | cancelled
  attempts int not null default 0,         -- reintentos del cron (máx 3)
  last_error text,
  created_at timestamptz not null default now(),
  constraint valid_channel check (channel in ('email','whatsapp')),
  -- idempotencia: confirmar dos veces no duplica el timeline
  constraint scheduled_messages_unique unique (reservation_id, template_key, channel)
);

create index if not exists scheduled_messages_due_idx
  on scheduled_messages (status, send_at);

alter table scheduled_messages enable row level security;

-- timeline visible para el admin; escribe solo el servidor (service role)
create policy "admin read scheduled messages"
  on scheduled_messages for select to authenticated
  using (true);

-- ─────────────────────────────────────────────
-- properties — wifi para el mensaje de llegada
-- (fallback en env: WIFI_NAME / WIFI_PASSWORD)
-- ─────────────────────────────────────────────
alter table properties
  add column if not exists wifi_name text,
  add column if not exists wifi_password text;

-- ─────────────────────────────────────────────
-- reservations — ruta del recibo PDF en Storage
-- ─────────────────────────────────────────────
alter table reservations
  add column if not exists receipt_path text;

-- ─────────────────────────────────────────────
-- Storage: bucket privado de recibos (sube solo el servidor;
-- lee el admin con URL firmada, igual que payment-proofs)
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 2097152, array['application/pdf'])
on conflict (id) do nothing;

create policy "admin read receipts"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'receipts');
