-- Plantilla de reservas — precios entre semana / fin de semana por temporada (Etapa 8.5)
-- 0010: cada season (y el default de la propiedad) deja de tener UN precio
-- base y pasa a DOS:
--   weekday_price_cents → noches de domingo a jueves
--   weekend_price_cents → noches de VIERNES y SÁBADO
-- (la "noche del domingo" empieza el domingo → weekday)

-- ─────────────────────────────────────────────
-- seasons: base_price_cents → weekday + weekend
-- ─────────────────────────────────────────────
alter table seasons
  add column if not exists weekday_price_cents int,
  add column if not exists weekend_price_cents int;

update seasons set
  weekday_price_cents = base_price_cents,
  weekend_price_cents = base_price_cents
where weekday_price_cents is null;

alter table seasons
  alter column weekday_price_cents set not null,
  alter column weekend_price_cents set not null,
  add constraint valid_weekday_price check (weekday_price_cents > 0),
  add constraint valid_weekend_price check (weekend_price_cents > 0);

alter table seasons drop column base_price_cents;

-- ─────────────────────────────────────────────
-- properties: default weekday + weekend
-- ─────────────────────────────────────────────
alter table properties
  add column if not exists weekday_price_cents int,
  add column if not exists weekend_price_cents int;

update properties set
  weekday_price_cents = base_price_cents,
  weekend_price_cents = base_price_cents
where weekday_price_cents is null;

alter table properties
  alter column weekday_price_cents set not null,
  alter column weekend_price_cents set not null,
  add constraint valid_weekday_default check (weekday_price_cents > 0),
  add constraint valid_weekend_default check (weekend_price_cents > 0);

alter table properties drop column base_price_cents;

-- (Precios y temporadas de ejemplo: ver supabase/seed.sql.)
