-- Plantilla de reservas — carrito de snacks con pago dinámico (Etapa 16)
-- 0012: órdenes de snacks pagadas con la cajita de Payphone. El total
-- SIEMPRE se recalcula en servidor con los precios de la tabla addons.

-- Sin formulario propio: el flujo es carrito → "Pagar" → cajita. Los datos
-- del comprador (email/teléfono) los entrega Payphone en la CONFIRMACIÓN
-- del pago y ahí se rellenan — por eso son nullable.
create table if not exists snack_orders (
  id uuid primary key default gen_random_uuid(),
  items jsonb not null,            -- [{addon_id, nombre, precio_unit_cents, cantidad}]
  total_cents int not null,
  customer_name text,
  customer_email text,
  customer_phone text,
  status text not null default 'pending',  -- pending | paid | cancelled
  payment_id uuid,                 -- intento de pago que la cobró (payments.id)
  created_at timestamptz not null default now(),
  constraint valid_snack_total check (total_cents > 0),
  constraint valid_snack_status check (status in ('pending','paid','cancelled'))
);

create index if not exists snack_orders_status_idx on snack_orders (status, created_at);

alter table snack_orders enable row level security;

create policy "admin read snack orders"
  on snack_orders for select to authenticated
  using (true);

-- ─────────────────────────────────────────────
-- payments: ahora audita reservas O snacks
-- (misma idempotencia: unique provider + client_transaction_id)
-- ─────────────────────────────────────────────
alter table payments alter column reservation_id drop not null;
alter table payments
  add column if not exists snack_order_id uuid references snack_orders(id) on delete cascade;

alter table payments
  add constraint payment_has_subject
  check (reservation_id is not null or snack_order_id is not null);

create index if not exists payments_snack_order_idx on payments (snack_order_id);
