-- Copia versionada del esquema aplicado en Supabase (proyecto: playmatch / qtkudukcmjypjsvsxpvl)
-- Aplicada en producción el 2026-08-18. Ver también 20260818000002_rls_policies.sql
-- y 20260818000003_security_hardening.sql.
--
-- Para replicar en un nuevo entorno (ej. staging):
--   supabase db push --db-url <connection-string>
-- o pega este contenido en el SQL Editor de Supabase.

create extension if not exists "uuid-ossp";

create type public.user_role as enum ('player', 'owner', 'admin');
create type public.sport_type as enum ('futbol', 'padel', 'voley');
create type public.booking_status as enum ('pending_payment', 'confirmed', 'cancelled', 'completed');
create type public.payout_status as enum ('pending', 'paid');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  whatsapp_number text,
  role public.user_role not null default 'player',
  is_approved_owner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'Usuario'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.venues (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  address text not null,
  city text not null default 'Medellín',
  neighborhood text,
  lat double precision,
  lng double precision,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.courts (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  sport public.sport_type not null,
  name text not null,
  description text,
  price_per_hour numeric(10,2) not null check (price_per_hour > 0),
  slot_duration_minutes int not null default 60,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.court_photos (
  id uuid primary key default uuid_generate_v4(),
  court_id uuid not null references public.courts(id) on delete cascade,
  url text not null,
  sort_order int not null default 0
);

create table public.court_schedules (
  id uuid primary key default uuid_generate_v4(),
  court_id uuid not null references public.courts(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  open_time time not null,
  close_time time not null,
  check (close_time > open_time)
);

create table public.court_closures (
  id uuid primary key default uuid_generate_v4(),
  court_id uuid not null references public.courts(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

create table public.bookings (
  id uuid primary key default uuid_generate_v4(),
  court_id uuid not null references public.courts(id) on delete restrict,
  player_id uuid not null references public.profiles(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status public.booking_status not null default 'pending_payment',
  total_price numeric(10,2) not null,
  commission_rate numeric(5,2) not null default 10.00,
  commission_amount numeric(10,2) not null,
  owner_payout_amount numeric(10,2) not null,
  wompi_transaction_id text,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

create extension if not exists btree_gist schema extensions;
alter table public.bookings
  add constraint no_overlapping_bookings
  exclude using gist (
    court_id with =,
    tstzrange(start_at, end_at) with &&
  )
  where (status in ('pending_payment', 'confirmed'));

create index idx_bookings_court on public.bookings(court_id, start_at);
create index idx_bookings_player on public.bookings(player_id);

create table public.payouts (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount numeric(10,2) not null,
  status public.payout_status not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notifications_log (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid references public.bookings(id) on delete cascade,
  channel text not null,
  status text not null,
  sent_at timestamptz not null default now()
);
