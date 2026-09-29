-- Plantilla de reservas — formulario de huésped completo (Etapa 12)
-- 0009: datos estilo Airbnb del titular y su grupo. El PDF del recibo y
-- los avisos al dueño usan estos campos.

alter table reservations
  add column if not exists guest_document_type text,        -- 'cedula' | 'pasaporte'
  add column if not exists guest_document text,
  add column if not exists guest_country text,
  add column if not exists arrival_time text,               -- franja estimada ("18h00 a 20h00")
  add column if not exists pet_count int not null default 0,
  add column if not exists guest_message text,              -- mensaje opcional al anfitrión
  add column if not exists companions jsonb;                -- ["Nombre Apellido", ...]

alter table reservations
  add constraint valid_pet_count check (pet_count >= 0 and pet_count <= 4),
  add constraint valid_document_type
    check (guest_document_type is null or guest_document_type in ('cedula','pasaporte'));
