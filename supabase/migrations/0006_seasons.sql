-- Plantilla de reservas — temporadas + nuevo motor de precios (Etapa 8)
-- 0006: el modelo por persona (0005) queda REEMPLAZADO por:
--   base_noche  = precio base de la season de esa noche (o default de la propiedad)
--   extras      = max(0, huéspedes - included_guests) × extra_guest_price (NO varía por season)
--   alojamiento = Σ noche a noche · total = alojamiento + cajita + limpieza
-- Las columnas de 0005 (price_per_person_per_night, min_billable_guests,
-- child_factor, weekend_multiplier, billable_units, price_per_person) quedan
-- deprecadas: se conservan solo por el histórico de reservas.

-- ─────────────────────────────────────────────
-- seasons — temporadas con precio base propio
-- Una noche N pertenece a la season si date_start <= N < date_end
-- (intervalo medio-abierto '[)', igual que reservations).
-- Si varias seasons cubren la misma noche gana la de mayor priority.
-- ─────────────────────────────────────────────
create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  name text not null,
  date_start date not null,
  date_end date not null,
  base_price_cents int not null,
  priority int not null default 0,
  created_at timestamptz not null default now(),
  constraint valid_season_dates check (date_end > date_start),
  constraint valid_season_price check (base_price_cents > 0)
);

create index if not exists seasons_property_dates_idx
  on seasons (property_id, date_start, date_end);

alter table seasons enable row level security;

-- Los precios por noche son públicos (el calendario los muestra)
create policy "public read seasons"
  on seasons for select
  using (true);

create policy "admin full access seasons"
  on seasons for all to authenticated
  using (true) with check (true);

-- ─────────────────────────────────────────────
-- properties — parámetros del nuevo modelo
-- ─────────────────────────────────────────────
alter table properties
  add column if not exists base_price_cents int not null default 10000,        -- base default (sin season)
  add column if not exists extra_guest_price_cents int not null default 2500,  -- por huésped extra y noche
  add column if not exists included_guests int not null default 4;             -- cubiertos por el base

alter table properties
  add constraint valid_base_price_cents check (base_price_cents > 0),
  add constraint valid_extra_guest_price check (extra_guest_price_cents >= 0),
  add constraint valid_included_guests check (included_guests >= 1);

-- ─────────────────────────────────────────────
-- reservations — desglose noche a noche auditable
-- [{ date, base_price, season, extra_guests_fee }, ...]
-- ─────────────────────────────────────────────
alter table reservations
  add column if not exists price_breakdown jsonb;

-- (Valores de negocio y temporadas de ejemplo: ver supabase/seed.sql.)
