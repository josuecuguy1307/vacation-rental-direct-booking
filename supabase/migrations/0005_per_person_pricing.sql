-- Plantilla de reservas — tarifa por huésped (estilo Airbnb)
-- 0005: el precio deja de ser plano por noche y pasa a:
--   billable = max(adultos + niños×child_factor, min_billable_guests)
--   precio_noche = billable × price_per_person_per_night (×weekend_multiplier vie/sáb)
-- Sin romper reservas existentes: columnas nuevas nullable / con default.

-- ── properties: parámetros de la tarifa ──────────────────
alter table properties
  add column if not exists price_per_person_per_night numeric(10,2) not null default 30.00,
  add column if not exists min_billable_guests int not null default 4,
  add column if not exists child_factor numeric(3,2) not null default 0.50,
  add column if not exists weekend_multiplier numeric(4,2) not null default 1.00;

alter table properties
  add constraint valid_child_factor check (child_factor >= 0 and child_factor <= 1),
  add constraint valid_weekend_multiplier check (weekend_multiplier >= 1),
  add constraint valid_min_billable check (min_billable_guests >= 1);

-- ── reservations: desglose auditable ─────────────────────
alter table reservations
  add column if not exists adults int,
  add column if not exists children int not null default 0,
  add column if not exists billable_units numeric(5,2),
  add column if not exists price_per_person numeric(10,2),
  add column if not exists nights int;

-- backfill de las reservas previas al modelo por persona
update reservations set adults = num_guests, children = 0 where adults is null;

alter table reservations
  add constraint valid_children check (children >= 0);

-- (Los valores de negocio —precios, límites— NO van en migraciones: se cargan con
--  supabase/seed.sql y se editan desde el panel.)
