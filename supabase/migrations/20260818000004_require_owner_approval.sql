-- Copia versionada, aplicada en producción el 2026-08-18.
-- Un dueño solo puede crear sedes si ya fue aprobado por un admin.
drop policy "venues_owner_insert" on public.venues;

create policy "venues_owner_insert" on public.venues
  for insert with check (
    owner_id = auth.uid()
    and (
      public.current_role() = 'admin'
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'owner' and p.is_approved_owner = true
      )
    )
  );
