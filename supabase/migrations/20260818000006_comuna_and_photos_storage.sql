-- Comuna oficial de Medellín donde queda la sede (además del barrio libre que
-- ya existía). Ver lib/medellin.ts para la lista de comunas válidas — no se
-- valida con un enum/FK a propósito, para no tener que migrar si cambia la
-- lista de referencia.
alter table public.venues add column if not exists comuna text;

-- Bucket público de fotos de canchas. Lectura pública (para mostrarlas en el
-- sitio sin autenticación), escritura solo para el dueño de la cancha
-- correspondiente. Convención de carpeta: <court_id>/<archivo>.
insert into storage.buckets (id, name, public)
values ('court-photos', 'court-photos', true)
on conflict (id) do nothing;

drop policy if exists "court_photos_public_read" on storage.objects;
create policy "court_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'court-photos');

drop policy if exists "court_photos_owner_insert" on storage.objects;
create policy "court_photos_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'court-photos'
    and exists (
      select 1 from public.courts c
      join public.venues v on v.id = c.venue_id
      where c.id::text = (storage.foldername(storage.objects.name))[1]
        and v.owner_id = auth.uid()
    )
  );

drop policy if exists "court_photos_owner_delete" on storage.objects;
create policy "court_photos_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'court-photos'
    and exists (
      select 1 from public.courts c
      join public.venues v on v.id = c.venue_id
      where c.id::text = (storage.foldername(storage.objects.name))[1]
        and v.owner_id = auth.uid()
    )
  );
