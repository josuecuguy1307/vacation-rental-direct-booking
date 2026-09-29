-- Plantilla de reservas directas — seed de EJEMPLO (todo ficticio)
-- 1 propiedad + addons + reseñas + temporadas + snacks de muestra.
--
-- ⚠️ Reemplaza estos valores por los de tu propiedad (o edítalos luego desde
-- el panel de administración). El `slug` DEBE coincidir con SITE.slug de
-- src/config/site.config.ts ("mi-casa" por defecto).
--
-- En una base nueva las migraciones corren ANTES del seed, así que sus UPDATE
-- a `properties` son no-op y estos valores son los que mandan.

insert into properties
  (id, slug, name, description, base_price_per_night, cleaning_fee, max_guests,
   min_nights, deposit_percentage, weekday_price_cents, weekend_price_cents,
   extra_guest_price_cents, included_guests, location, address, amenities, images)
values (
  'a1b2c3d4-0000-4000-8000-000000000001',
  'mi-casa',
  'Mi Casa Vacacional',
  'Casa de ejemplo para reservas directas. Reemplaza esta descripción por la de '
  || 'tu propiedad: qué la hace especial, para quién es ideal y qué incluye.',
  100.00,  -- legacy, informativo; el motor usa weekday/weekend_price_cents
  20.00,   -- limpieza por estadía
  8,       -- capacidad máxima
  2,       -- mínimo de noches
  100,     -- % que se cobra para confirmar (100 = pago completo)
  10000,   -- precio base entre semana, en centavos ($100.00; cubre a los huéspedes incluidos)
  11000,   -- precio base fin de semana, en centavos ($110.00)
  2000,    -- por huésped extra y noche, en centavos ($20.00)
  4,       -- huéspedes incluidos en el precio base
  'Tu Ciudad, Tu Región, Tu País',
  'Calle Ejemplo 123, Tu Ciudad',
  '["wifi","cocina equipada","parqueadero","agua caliente","terraza","jardín","bbq","smart tv"]'::jsonb,
  '[]'::jsonb
)
on conflict (slug) do nothing;

-- extras opcionales que el huésped puede añadir a su reserva
insert into addons (property_id, name, description, price, type, active) values
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Desayuno (ejemplo)',
   'Desayuno servido en la terraza. Precio por persona.', 8.00, 'per_person', true),
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Decoración especial (ejemplo)',
   'Decoración para celebraciones a la llegada. Precio por estadía.', 35.00, 'per_stay', true),
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Leña para fogata (ejemplo)',
   'Paquete de leña seca para la zona de fogata. Precio por noche.', 12.00, 'per_night', true),
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Excursión guiada (ejemplo)',
   'Excursión de medio día con guía local. Precio por persona.', 25.00, 'per_person', true),
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Salida tardía (ejemplo)',
   'Salida extendida, sujeta a disponibilidad.', 20.00, 'per_stay', true)
on conflict do nothing;

-- reseñas de muestra (ficticias) para ver el sitio poblado
insert into reviews (property_id, guest_name, rating, comment, date, approved) values
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Huésped Ejemplo 1', 5,
   'Reseña de ejemplo: describe aquí la experiencia de un huésped.', '2026-01-15', true),
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Huésped Ejemplo 2', 5,
   'Otra reseña de ejemplo. Puedes borrarlas desde el panel.', '2026-02-10', true),
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Huésped Ejemplo 3', 4,
   'Tercera reseña de ejemplo.', '2026-03-05', true)
on conflict do nothing;

-- temporadas de ejemplo (requiere 0010_weekday_weekend). Precios en centavos.
-- Fuera de estos rangos se usa el precio base de la propiedad. Editables desde el panel.
insert into seasons (id, property_id, name, date_start, date_end, weekday_price_cents, weekend_price_cents, priority) values
  ('b0006001-0000-4000-8000-000000000001', 'a1b2c3d4-0000-4000-8000-000000000001',
   'Feriado de ejemplo',      '2026-04-02', '2026-04-06', 12000, 13000, 10),
  ('b0006001-0000-4000-8000-000000000002', 'a1b2c3d4-0000-4000-8000-000000000001',
   'Navidad y Año Nuevo',     '2026-12-24', '2027-01-04', 12000, 13000, 10),
  ('b0010001-0000-4000-8000-000000000001', 'a1b2c3d4-0000-4000-8000-000000000001',
   'Temporada baja',          '2026-09-01', '2026-10-15',  9000, 10000, 10),
  ('b0010001-0000-4000-8000-000000000002', 'a1b2c3d4-0000-4000-8000-000000000001',
   'Temporada alta (verano)', '2026-07-01', '2026-08-15', 12000, 13000, 10)
on conflict (id) do nothing;

-- snacks de ejemplo (la "cajita") — requiere 0004_addon_category.
-- Las imágenes son placeholders de public/assets/snacks: cámbialas por las tuyas.
insert into addons (property_id, name, price, type, category, image_url, active) values
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Snack de ejemplo 1', 2.50, 'per_stay', 'snack', '/assets/snacks/nutella.webp', true),
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Snack de ejemplo 2', 1.50, 'per_stay', 'snack', '/assets/snacks/pringles.jpg', true),
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Snack de ejemplo 3', 2.00, 'per_stay', 'snack', '/assets/snacks/popcorn.webp', true),
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Snack de ejemplo 4', 1.25, 'per_stay', 'snack', '/assets/snacks/kars.webp', true),
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Snack de ejemplo 5', 1.25, 'per_stay', 'snack', '/assets/snacks/kind.png', true),
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Snack de ejemplo 6', 1.50, 'per_stay', 'snack', '/assets/snacks/maruchan.jpg', true),
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Snack de ejemplo 7', 1.00, 'per_stay', 'snack', '/assets/snacks/belvita.webp', true),
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Dulces surtidos',    2.50, 'per_stay', 'snack', null, true),
  ('a1b2c3d4-0000-4000-8000-000000000001', 'Caramelos',          0.50, 'per_stay', 'snack', null, true)
on conflict do nothing;
