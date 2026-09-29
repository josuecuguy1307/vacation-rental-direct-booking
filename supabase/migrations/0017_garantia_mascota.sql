-- Plantilla de reservas — garantía reembolsable + cargo por mascota (Lane 2)
-- 0017:
--   · properties: precio por mascota y monto de garantía viven JUNTO a los
--     demás precios base (weekday/weekend/extra_guest/cleaning), editables
--     desde el panel (Ajustes → Precios) — los consume lib/pricing.
--   · reservations: la garantía ($30) se cobra con la reserva y se reembolsa
--     al finalizar la estadía; su ciclo se audita con columnas dedicadas,
--     mismo patrón que balance_* (0013) y settled_* (0016).
-- Aditiva e idempotente (if not exists); no toca reservas existentes
-- (garantia_amount_cents default 0 = sin garantía; estado null = n/a).

-- ── properties: precios editables ──
alter table properties
  add column if not exists pet_price_cents int not null default 1600,   -- $16 por mascota, por estadía
  add column if not exists guarantee_cents int not null default 3000;   -- $30 garantía reembolsable, por reserva

-- ── reservations: ciclo de la garantía ──
alter table reservations
  add column if not exists garantia_amount_cents int not null default 0, -- cobrado como garantía (0 = sin garantía)
  add column if not exists garantia_estado text,                         -- null=n/a | 'pendiente' | 'reembolsada'
  add column if not exists garantia_metodo text,                         -- 'tarjeta' | 'transferencia' (preferencia del huésped)
  add column if not exists garantia_refunded_at timestamptz,
  add column if not exists garantia_refunded_by text;                    -- email del admin que disparó el reembolso
