-- Nueva cancha nunca queda visible al público hasta que un admin la apruebe.
alter table public.courts add column if not exists is_approved boolean not null default false;

-- Backfill: canchas ya publicadas antes de este cambio quedan aprobadas
-- automáticamente (ya estaban públicas y en producción, no las bloqueamos
-- retroactivamente).
update public.courts set is_approved = true where is_approved = false;

-- La lectura pública ahora exige activa Y aprobada por un admin.
drop policy if exists "courts_public_read_active" on public.courts;
create policy "courts_public_read_active" on public.courts
  for select using (
    (is_active = true and is_approved = true)
    or exists (select 1 from public.venues v where v.id = venue_id and (v.owner_id = auth.uid() or public.current_role() = 'admin'))
  );

-- Defensa en profundidad: aunque el dueño tiene permiso de escritura sobre
-- sus propias canchas (courts_owner_write), no debe poder auto-aprobarse.
-- Solo un admin puede cambiar is_approved. Esto se aplica a nivel de base de
-- datos, no solo en el formulario de la app, para que no se pueda saltar
-- llamando a la API directamente.
create or replace function public.protect_court_approval()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if public.current_role() <> 'admin' then
      new.is_approved := false;
    end if;
  elsif TG_OP = 'UPDATE' then
    if public.current_role() <> 'admin' and new.is_approved is distinct from old.is_approved then
      new.is_approved := old.is_approved;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_court_approval on public.courts;
create trigger trg_protect_court_approval
before insert or update on public.courts
for each row execute function public.protect_court_approval();
