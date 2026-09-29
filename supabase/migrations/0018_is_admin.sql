-- Plantilla de reservas — 0018: "admin" deja de ser "cualquier usuario autenticado"
--
-- Antes, todas las políticas admin eran `to authenticated using (true)`:
-- si el signup público de Supabase quedaba abierto, cualquiera que se
-- registrara con la anon key podía leer y editar reservas, datos bancarios
-- (app_settings) y pagos directo por la API de Supabase.
--
-- Ahora admin = JWT con app_metadata.role = 'admin'. app_metadata SOLO lo
-- escribe el service role (el usuario no puede ponérselo a sí mismo).
--
-- La app no cambia: todas las rutas /api/admin/* usan el service role.
-- Para marcar a la dueña como admin (SQL Editor de Supabase, una vez):
--
--   update auth.users
--      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'
--    where email = '<correo-de-la-dueña>';
--
-- (El claim entra al JWT en el próximo login.)

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

-- ── Gestión completa (for all) ─────────────────────────────
alter policy "admin full access properties"         on public.properties         using (public.is_admin()) with check (public.is_admin());
alter policy "admin full access addons"             on public.addons             using (public.is_admin()) with check (public.is_admin());
alter policy "admin full access reservations"       on public.reservations       using (public.is_admin()) with check (public.is_admin());
alter policy "admin full access reservation_addons" on public.reservation_addons using (public.is_admin()) with check (public.is_admin());
alter policy "admin full access reviews"            on public.reviews            using (public.is_admin()) with check (public.is_admin());
alter policy "admin full access ical_blocks"        on public.ical_blocks        using (public.is_admin()) with check (public.is_admin());
alter policy "admin full access ical_feeds"         on public.ical_feeds         using (public.is_admin()) with check (public.is_admin());
alter policy "admin full access seasons"            on public.seasons            using (public.is_admin()) with check (public.is_admin());

-- ── Solo lectura ───────────────────────────────────────────
alter policy "admin read payment_events"      on public.payment_events     using (public.is_admin());
alter policy "admin read payments"            on public.payments           using (public.is_admin());
alter policy "admin read scheduled messages"  on public.scheduled_messages using (public.is_admin());
alter policy "admin read snack orders"        on public.snack_orders       using (public.is_admin());
alter policy "admin read audit log"           on public.audit_log          using (public.is_admin());
alter policy "admin read settings"            on public.app_settings       using (public.is_admin());

-- ── Storage (buckets privados) ─────────────────────────────
alter policy "admin read payment proofs" on storage.objects using (bucket_id = 'payment-proofs' and public.is_admin());
alter policy "admin read receipts"       on storage.objects using (bucket_id = 'receipts'       and public.is_admin());
