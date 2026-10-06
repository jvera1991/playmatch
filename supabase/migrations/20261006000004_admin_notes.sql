-- Notas internas del equipo Playmatch sobre jugadores y dueños (06/10/2026).
-- Solo el admin las lee y escribe (RLS); jugadores y dueños nunca las ven.
create table if not exists public.admin_notes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  notes text not null default '' check (char_length(notes) <= 4000),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.admin_notes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='admin_notes' and policyname='admin_notes_admin_only') then
    create policy admin_notes_admin_only on public.admin_notes
      for all
      using ((select public.current_role()) = 'admin')
      with check ((select public.current_role()) = 'admin');
  end if;
end $$;

create index if not exists idx_admin_notes_updated_by on public.admin_notes (updated_by);
