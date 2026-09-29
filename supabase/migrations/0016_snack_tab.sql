-- Plantilla de reservas — Snacks como CUENTA acumulada por reserva (tab) — Etapa 21
-- 0016: los snacks dejan de cobrarse con tarjeta al instante. Ahora cada
-- consumo se liga a la reserva ACTIVA y se acumula como un tab que la dueña
-- liquida al final por transferencia/efectivo desde el panel.
--
-- Additiva y nullable → sin backfill; las órdenes legacy (pago directo
-- Payphone) quedan con reservation_id null e intactas. status sigue siendo
-- pending | paid | cancelled: en el tab, pending = en la cuenta sin pagar,
-- paid = liquidada por la dueña (+ settled_*). caja/dashboard cuentan 'paid'
-- igual que antes.

alter table snack_orders
  add column if not exists reservation_id uuid references reservations(id) on delete set null,
  add column if not exists settled_method text,     -- 'transfer' | 'cash'
  add column if not exists settled_by     text,     -- email del admin que liquidó
  add column if not exists settled_at     timestamptz;

create index if not exists snack_orders_reservation_idx
  on snack_orders (reservation_id, status);
