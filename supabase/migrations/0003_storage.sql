-- Plantilla de reservas — Storage
-- 0003: bucket para comprobantes de transferencia

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,                                  -- privado: solo admin lo lee
  5242880,                                -- 5 MB
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do nothing;

-- Subida anónima permitida (el huésped sube su comprobante);
-- lectura solo para admin autenticado.
create policy "anon upload payment proofs"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'payment-proofs');

create policy "admin read payment proofs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'payment-proofs');
