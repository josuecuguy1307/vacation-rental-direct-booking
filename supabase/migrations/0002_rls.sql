-- Plantilla de reservas — RLS
-- 0002: políticas de seguridad a nivel de fila
--
-- Modelo: sitio de un solo dueño. Cualquier usuario autenticado de Supabase
-- Auth es admin (desactiva el signup público en el dashboard de Supabase:
-- Authentication → Providers → Email → "Allow new users to sign up" = OFF,
-- y crea al admin manualmente). El service role (solo servidor) salta RLS.

alter table properties         enable row level security;
alter table addons             enable row level security;
alter table reservations       enable row level security;
alter table reservation_addons enable row level security;
alter table reviews            enable row level security;
alter table ical_blocks        enable row level security;
alter table ical_feeds         enable row level security;
alter table payment_events     enable row level security;

-- ─────────────────────────────────────────────
-- Lectura pública (anon + authenticated)
-- ─────────────────────────────────────────────
create policy "public read active properties"
  on properties for select
  using (active);

create policy "public read active addons"
  on addons for select
  using (active);

create policy "public read approved reviews"
  on reviews for select
  using (approved);

-- Bloqueos visibles para pintar el calendario (solo fechas, sin datos sensibles)
create policy "public read ical blocks"
  on ical_blocks for select
  using (true);

-- ─────────────────────────────────────────────
-- Inserción pública de reservas pending
-- (la API usa service role y recalcula precios; esta política existe como
--  defensa en profundidad si el frontend insertara directo)
-- ─────────────────────────────────────────────
create policy "anon insert pending reservations"
  on reservations for insert
  to anon, authenticated
  with check (status = 'pending' and payment_status = 'unpaid');

create policy "anon insert reservation addons"
  on reservation_addons for insert
  to anon, authenticated
  with check (true);

create policy "anon insert pending reviews"
  on reviews for insert
  to anon, authenticated
  with check (approved = false);

-- ─────────────────────────────────────────────
-- Admin (cualquier usuario autenticado) — gestión completa
-- ─────────────────────────────────────────────
create policy "admin full access properties"
  on properties for all to authenticated
  using (true) with check (true);

create policy "admin full access addons"
  on addons for all to authenticated
  using (true) with check (true);

create policy "admin full access reservations"
  on reservations for all to authenticated
  using (true) with check (true);

create policy "admin full access reservation_addons"
  on reservation_addons for all to authenticated
  using (true) with check (true);

create policy "admin full access reviews"
  on reviews for all to authenticated
  using (true) with check (true);

create policy "admin full access ical_blocks"
  on ical_blocks for all to authenticated
  using (true) with check (true);

create policy "admin full access ical_feeds"
  on ical_feeds for all to authenticated
  using (true) with check (true);

create policy "admin read payment_events"
  on payment_events for select to authenticated
  using (true);
