-- Plantilla de reservas — esquema base
-- 0001: extensiones, tipos, tablas

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────
-- Tipos
-- ─────────────────────────────────────────────
create type reservation_status as enum ('pending','confirmed','cancelled','completed');
create type addon_type as enum ('per_stay','per_night','per_person');

-- ─────────────────────────────────────────────
-- properties
-- ─────────────────────────────────────────────
create table properties (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  base_price_per_night numeric(10,2) not null,
  cleaning_fee numeric(10,2) not null default 0,
  max_guests int not null default 2,
  min_nights int not null default 1,
  deposit_percentage numeric(5,2) not null default 50,
  location text,
  address text,
  amenities jsonb not null default '[]'::jsonb,
  images jsonb not null default '[]'::jsonb,
  check_in_time time not null default '15:00',
  check_out_time time not null default '11:00',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint valid_deposit check (deposit_percentage >= 0 and deposit_percentage <= 100)
);

-- ─────────────────────────────────────────────
-- addons
-- ─────────────────────────────────────────────
create table addons (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null,
  type addon_type not null default 'per_stay',
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- reservations — anti doble-reserva a nivel de DB
-- ─────────────────────────────────────────────
create table reservations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id),
  guest_name text not null,
  guest_email text not null,
  guest_phone text,
  check_in date not null,
  check_out date not null,
  num_guests int not null,
  status reservation_status not null default 'pending',
  subtotal numeric(10,2) not null,
  extras_total numeric(10,2) not null default 0,
  cleaning_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  deposit_amount numeric(10,2) not null,
  payment_method text,
  payment_status text not null default 'unpaid',
  payment_provider_ref text,
  payment_proof_url text,
  notes text,
  created_at timestamptz not null default now(),
  constraint valid_dates check (check_out > check_in),
  constraint valid_guests check (num_guests > 0),
  -- Fuente de verdad ante condiciones de carrera: dos reservas activas no
  -- pueden solapar fechas. '[)' permite check-out = check-in del siguiente.
  constraint no_double_booking exclude using gist (
    property_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (status in ('pending','confirmed'))
);

create index reservations_property_dates_idx on reservations (property_id, check_in, check_out);
create index reservations_status_idx on reservations (status);

-- ─────────────────────────────────────────────
-- reservation_addons
-- ─────────────────────────────────────────────
create table reservation_addons (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  addon_id uuid not null references addons(id),
  quantity int not null default 1,
  unit_price numeric(10,2) not null,
  constraint valid_quantity check (quantity > 0)
);

create index reservation_addons_reservation_idx on reservation_addons (reservation_id);

-- ─────────────────────────────────────────────
-- reviews
-- ─────────────────────────────────────────────
create table reviews (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  guest_name text not null,
  rating int not null,
  comment text,
  date date not null default current_date,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  constraint valid_rating check (rating between 1 and 5)
);

create index reviews_property_approved_idx on reviews (property_id) where approved;

-- ─────────────────────────────────────────────
-- ical_blocks — bloqueos importados de Airbnb/Booking o manuales
-- ─────────────────────────────────────────────
create table ical_blocks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  source text not null,                -- 'airbnb' | 'booking' | 'manual' | ...
  start_date date not null,
  end_date date not null,
  uid text not null,
  summary text,
  created_at timestamptz not null default now(),
  constraint valid_block_dates check (end_date > start_date),
  constraint ical_blocks_unique_uid unique (property_id, source, uid)
);

create index ical_blocks_property_dates_idx on ical_blocks (property_id, start_date, end_date);

-- ─────────────────────────────────────────────
-- ical_feeds — URLs de feeds externos a importar por cron
-- ─────────────────────────────────────────────
create table ical_feeds (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  source text not null,                -- 'airbnb' | 'booking'
  url text not null,
  active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ical_feeds_unique unique (property_id, source)
);

-- ─────────────────────────────────────────────
-- payment_events — idempotencia de webhooks
-- ─────────────────────────────────────────────
create table payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,              -- id del evento según el provider
  reservation_id uuid references reservations(id),
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  constraint payment_events_unique unique (provider, event_id)
);
