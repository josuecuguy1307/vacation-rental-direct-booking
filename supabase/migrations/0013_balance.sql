-- Plantilla de reservas — pago del saldo (70%) — Etapa 17
-- 0013: la reserva conoce su saldo y payment_status gana granularidad:
--   unpaid → deposit_paid (anticipo 30% cobrado) → fully_paid (saldo cobrado)
-- Las filas legacy con 'paid' significan anticipo pagado → deposit_paid.

alter table reservations
  add column if not exists balance_due_cents int,         -- total − anticipo, en centavos
  add column if not exists balance_paid_at timestamptz,
  add column if not exists balance_method text,           -- 'payphone_link' | 'cash' | 'transfer'
  add column if not exists balance_registered_by text;    -- quién lo registró (admin/email)

-- backfill: saldo = total − anticipo (redondeo en centavos)
update reservations
set balance_due_cents = round(total * 100)::int - round(deposit_amount * 100)::int
where balance_due_cents is null;

-- legacy: 'paid' era "anticipo pagado"
update reservations set payment_status = 'deposit_paid' where payment_status = 'paid';

-- payments: los links de saldo expiran (72h) y se pueden regenerar
-- (status pasa a 'expired' al emitir uno nuevo)
