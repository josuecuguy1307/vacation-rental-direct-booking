-- Plantilla de reservas — categoría de addons
-- 0004: distingue experiencias (tours, desayuno...) de snacks (la "cajita").
-- Ambos viajan igual por reservation_addons; la categoría es para la UI.

alter table addons add column if not exists category text not null default 'experience';
alter table addons add constraint addons_category_check
  check (category in ('experience','snack'));
