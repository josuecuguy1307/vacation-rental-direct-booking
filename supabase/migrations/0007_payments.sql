-- Plantilla de reservas — auditoría de intentos de pago (Etapa 9: Payphone)
-- 0007: tabla payments. Cada intento de cobro (cajita embebida, link de
-- pago, etc.) queda registrado con su monto, estado y respuesta cruda del
-- provider. La confirmación de reservas sigue pasando por payment_events
-- (idempotencia de eventos); payments es el registro por INTENTO.

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  provider text not null,                    -- 'payphone' | 'bank_transfer' | 'pichincha' (pasarela bancaria opcional)
  method text not null default 'box',        -- 'box' (cajita embebida) | 'link' (link de pago)
  amount_cents int not null,                 -- Payphone trabaja en centavos ($100 = 10000)
  currency text not null default 'USD',
  status text not null default 'initiated',  -- initiated | approved | rejected | error
  client_transaction_id text not null,       -- el id que generamos (≤15 chars, único por intento)
  transaction_id text,                       -- id de la transacción según el provider
  raw_response jsonb,                        -- respuesta cruda del Confirm/Links (auditoría)
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint valid_payment_amount check (amount_cents > 0),
  -- idempotencia: un intento = un client_transaction_id por provider
  constraint payments_client_tx_unique unique (provider, client_transaction_id)
);

create index payments_reservation_idx on payments (reservation_id);
create index payments_status_idx on payments (status);

alter table payments enable row level security;

-- Solo el admin lee (auditoría); escribe únicamente el servidor (service role)
create policy "admin read payments"
  on payments for select to authenticated
  using (true);
