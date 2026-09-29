-- Plantilla de reservas — sistema de reseñas estilo Airbnb (Etapa 14)
-- 0011: la tabla reviews pasa de (rating, approved) a evaluación completa:
--   una reseña POR RESERVA (reservation_id unique — solo quien se hospedó),
--   calificación general + 6 categorías, y moderación por status.
-- Las columnas legacy (rating, approved) se conservan y se migran.

alter table reviews
  add column if not exists reservation_id uuid unique references reservations(id) on delete set null,
  add column if not exists display_name text,            -- "María J." (editable por el huésped)
  add column if not exists rating_overall int,
  add column if not exists limpieza int,
  add column if not exists veracidad int,
  add column if not exists llegada int,
  add column if not exists comunicacion int,
  add column if not exists ubicacion int,
  add column if not exists calidad_precio int,
  add column if not exists status text not null default 'pending';

alter table reviews
  add constraint valid_rating_overall check (rating_overall is null or rating_overall between 1 and 5),
  add constraint valid_limpieza        check (limpieza is null or limpieza between 1 and 5),
  add constraint valid_veracidad       check (veracidad is null or veracidad between 1 and 5),
  add constraint valid_llegada         check (llegada is null or llegada between 1 and 5),
  add constraint valid_comunicacion    check (comunicacion is null or comunicacion between 1 and 5),
  add constraint valid_ubicacion       check (ubicacion is null or ubicacion between 1 and 5),
  add constraint valid_calidad_precio  check (calidad_precio is null or calidad_precio between 1 and 5),
  add constraint valid_review_status   check (status in ('pending','published','rejected'));

-- migrar las reseñas existentes (seed de Airbnb): rating → overall,
-- approved → published; sin categorías (quedan null, el promedio las ignora)
update reviews set
  rating_overall = coalesce(rating_overall, rating),
  display_name   = coalesce(display_name, guest_name),
  status         = case when approved then 'published' else 'pending' end
where rating_overall is null;

create index if not exists reviews_status_idx on reviews (status);

-- RLS: la lectura pública ahora filtra por status (antes: approved)
drop policy if exists "public read approved reviews" on reviews;
create policy "public read published reviews"
  on reviews for select
  using (status = 'published');
