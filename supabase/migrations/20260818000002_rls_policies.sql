-- Row Level Security — copia versionada, aplicada en producción el 2026-08-18.

alter table public.profiles enable row level security;
alter table public.venues enable row level security;
alter table public.courts enable row level security;
alter table public.court_photos enable row level security;
alter table public.court_schedules enable row level security;
alter table public.court_closures enable row level security;
alter table public.bookings enable row level security;
alter table public.payouts enable row level security;
alter table public.notifications_log enable row level security;

create function public.current_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.current_role() = 'admin');

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

create policy "venues_public_read_active" on public.venues
  for select using (is_active = true or owner_id = auth.uid() or public.current_role() = 'admin');

create policy "venues_owner_insert" on public.venues
  for insert with check (owner_id = auth.uid() and public.current_role() in ('owner','admin'));

create policy "venues_owner_update" on public.venues
  for update using (owner_id = auth.uid() or public.current_role() = 'admin');

create policy "venues_owner_delete" on public.venues
  for delete using (owner_id = auth.uid() or public.current_role() = 'admin');

create policy "courts_public_read_active" on public.courts
  for select using (
    is_active = true
    or exists (select 1 from public.venues v where v.id = venue_id and (v.owner_id = auth.uid() or public.current_role() = 'admin'))
  );

create policy "courts_owner_write" on public.courts
  for all using (
    exists (select 1 from public.venues v where v.id = venue_id and (v.owner_id = auth.uid() or public.current_role() = 'admin'))
  ) with check (
    exists (select 1 from public.venues v where v.id = venue_id and (v.owner_id = auth.uid() or public.current_role() = 'admin'))
  );

create policy "court_photos_public_read" on public.court_photos
  for select using (true);

create policy "court_photos_owner_write" on public.court_photos
  for all using (
    exists (
      select 1 from public.courts c join public.venues v on v.id = c.venue_id
      where c.id = court_id and (v.owner_id = auth.uid() or public.current_role() = 'admin')
    )
  );

create policy "schedules_public_read" on public.court_schedules
  for select using (true);

create policy "schedules_owner_write" on public.court_schedules
  for all using (
    exists (
      select 1 from public.courts c join public.venues v on v.id = c.venue_id
      where c.id = court_id and (v.owner_id = auth.uid() or public.current_role() = 'admin')
    )
  );

create policy "closures_public_read" on public.court_closures
  for select using (true);

create policy "closures_owner_write" on public.court_closures
  for all using (
    exists (
      select 1 from public.courts c join public.venues v on v.id = c.venue_id
      where c.id = court_id and (v.owner_id = auth.uid() or public.current_role() = 'admin')
    )
  );

create policy "bookings_select_involved" on public.bookings
  for select using (
    player_id = auth.uid()
    or exists (
      select 1 from public.courts c join public.venues v on v.id = c.venue_id
      where c.id = court_id and v.owner_id = auth.uid()
    )
    or public.current_role() = 'admin'
  );

create policy "bookings_player_insert" on public.bookings
  for insert with check (player_id = auth.uid());

create policy "bookings_update_involved" on public.bookings
  for update using (
    player_id = auth.uid()
    or exists (
      select 1 from public.courts c join public.venues v on v.id = c.venue_id
      where c.id = court_id and v.owner_id = auth.uid()
    )
    or public.current_role() = 'admin'
  );

create policy "payouts_owner_read" on public.payouts
  for select using (owner_id = auth.uid() or public.current_role() = 'admin');

create policy "payouts_admin_write" on public.payouts
  for all using (public.current_role() = 'admin');

create policy "notifications_involved_read" on public.notifications_log
  for select using (
    exists (
      select 1 from public.bookings b where b.id = booking_id
      and (b.player_id = auth.uid() or public.current_role() = 'admin')
    )
  );
