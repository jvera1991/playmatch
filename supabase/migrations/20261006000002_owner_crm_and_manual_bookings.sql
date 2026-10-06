-- Mini-CRM del dueño + reservas manuales (06/10/2026). Aprobado por el
-- usuario con mockup: KPIs en /panel, /panel/clientes, ficha de cliente y
-- "+ Reserva manual" en el calendario. Decisiones: las reservas manuales NO
-- pagan comisión; el dueño puede ver nombre/WhatsApp solo de quienes
-- reservaron en SUS canchas.

-- 1) Clientes del dueño (manuales, o jugadores registrados con notas).
create table if not exists public.owner_customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  phone text check (phone is null or char_length(phone) <= 30),
  notes text check (notes is null or char_length(notes) <= 2000),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_owner_customers_owner on public.owner_customers (owner_id);
create unique index if not exists uq_owner_customers_owner_profile
  on public.owner_customers (owner_id, profile_id) where profile_id is not null;

alter table public.owner_customers enable row level security;

do $p$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='owner_customers' and policyname='owner_customers_own') then
    create policy owner_customers_own on public.owner_customers
      for all
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()));
  end if;
end
$p$;

-- 2) Origen de la reserva, cliente del CRM y método de pago.
alter table public.bookings add column if not exists source text not null default 'online';
alter table public.bookings add column if not exists customer_id uuid references public.owner_customers(id) on delete set null;
alter table public.bookings add column if not exists payment_method text;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_source_check') then
    alter table public.bookings add constraint bookings_source_check check (source in ('online', 'manual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_payment_method_check') then
    alter table public.bookings add constraint bookings_payment_method_check
      check (payment_method is null or payment_method in ('efectivo', 'transferencia', 'pendiente'));
  end if;
end
$c$;
create index if not exists idx_bookings_customer_id on public.bookings (customer_id);

-- 3) El dueño puede leer nombre y WhatsApp solo de quienes reservaron sus
--    canchas (antes no podía: las columnas salían vacías en Reservas y
--    Calendario del panel).
do $p$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_owner_reads_customers') then
    create policy profiles_owner_reads_customers on public.profiles
      for select
      using (exists (
        select 1
        from public.bookings b
        join public.courts c on c.id = b.court_id
        join public.venues v on v.id = c.venue_id
        where b.player_id = profiles.id and v.owner_id = (select auth.uid())
      ));
  end if;
end
$p$;

-- 4) Integridad de reservas: se agrega la rama "reserva manual" al trigger
--    de la migración 20261006000001. Todo lo demás queda igual.
create or replace function public.protect_booking_integrity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_court record;
  v_duration_min numeric;
  v_start_local timestamp;
  v_end_local timestamp;
  v_start_min numeric;
  v_end_min numeric;
  v_is_owner boolean;
  v_rate constant numeric := 10; -- mantener igual a COMMISSION_RATE en app/api/bookings/route.ts
  v_allowed_keys constant text[] := array['status', 'cancellation_reason', 'cancelled_at', 'cancelled_by'];
  v_owner_manual_keys constant text[] := array['status', 'cancellation_reason', 'cancelled_at', 'cancelled_by', 'payment_method', 'customer_id'];
begin
  -- Sistema (service role, sin usuario) o administrador: sin restricciones.
  if auth.uid() is null or public.current_role() = 'admin' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.wompi_transaction_id := null;
    new.reminder_sent_at := null;
    new.cancellation_reason := null;
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.created_at := now();

    select c.id, c.price_per_hour, c.slot_duration_minutes, c.is_active, c.is_approved, v.owner_id
      into v_court
      from courts c join venues v on v.id = c.venue_id
      where c.id = new.court_id;

    if not found then
      raise exception 'Esta cancha no está disponible para reservas.';
    end if;

    if new.start_at is null or new.end_at is null or new.end_at <= new.start_at then
      raise exception 'Horario de reserva inválido.';
    end if;

    v_duration_min := extract(epoch from (new.end_at - new.start_at)) / 60;

    -- ===== Reserva MANUAL: solo el dueño de la cancha =====
    if coalesce(new.source, 'online') = 'manual' then
      if v_court.owner_id <> auth.uid() then
        raise exception 'Solo el dueño de la cancha puede registrar reservas manuales.';
      end if;
      if new.player_id <> auth.uid() then
        raise exception 'Reserva manual inválida.';
      end if;
      if new.customer_id is null or not exists (
        select 1 from owner_customers oc where oc.id = new.customer_id and oc.owner_id = auth.uid()
      ) then
        raise exception 'Elige un cliente válido para la reserva manual.';
      end if;
      if v_duration_min > 12 * 60 then
        raise exception 'La reserva manual no puede durar más de 12 horas.';
      end if;
      if new.start_at < now() - interval '7 days' then
        raise exception 'Solo puedes registrar reservas manuales de los últimos 7 días en adelante.';
      end if;
      if new.total_price is null or new.total_price < 0 or new.total_price > 10000000 then
        raise exception 'El valor cobrado no es válido.';
      end if;
      if new.payment_method is null then
        new.payment_method := 'pendiente';
      end if;
      -- Dinero cobrado por fuera de Playmatch: sin comisión (decisión del
      -- negocio, 06/10/2026). El cupo queda confirmado y bloqueado.
      new.status := 'confirmed';
      new.total_price := round(new.total_price);
      new.commission_rate := 0;
      new.commission_amount := 0;
      new.owner_payout_amount := new.total_price;
      return new;
    end if;

    -- ===== Reserva EN LÍNEA (jugador) — igual que antes =====
    new.source := 'online';
    new.customer_id := null;
    new.payment_method := null;
    new.status := 'pending_payment';

    if not v_court.is_active or not v_court.is_approved then
      raise exception 'Esta cancha no está disponible para reservas.';
    end if;

    if new.start_at < now() then
      raise exception 'No se puede reservar un horario que ya pasó.';
    end if;

    if v_duration_min > 8 * 60
       or mod(v_duration_min, coalesce(v_court.slot_duration_minutes, 60)) <> 0 then
      raise exception 'La duración de la reserva no es válida para esta cancha.';
    end if;

    v_start_local := new.start_at at time zone 'America/Bogota';
    v_end_local := new.end_at at time zone 'America/Bogota';
    v_start_min := extract(epoch from (v_start_local - date_trunc('day', v_start_local))) / 60;
    v_end_min := v_start_min + v_duration_min;

    if not exists (
      select 1 from court_schedules s
      where s.court_id = new.court_id
        and s.day_of_week = extract(dow from v_start_local)
        and extract(epoch from s.open_time) / 60 <= v_start_min
        and (case when s.close_time = '00:00'::time then 1440
                  else extract(epoch from s.close_time) / 60 end) >= v_end_min
    ) then
      raise exception 'La cancha no está abierta en ese horario.';
    end if;

    if exists (
      select 1 from court_closures cl
      where cl.court_id = new.court_id
        and cl.start_at < new.end_at
        and cl.end_at > new.start_at
    ) then
      raise exception 'El dueño cerró la cancha en ese horario. Elige otro.';
    end if;

    new.total_price := round(v_court.price_per_hour * v_duration_min / 60);
    new.commission_rate := v_rate;
    new.commission_amount := round(new.total_price * v_rate / 100);
    new.owner_payout_amount := new.total_price - new.commission_amount;
    return new;
  end if;

  -- UPDATE. En una reserva manual, el dueño también puede cambiar el método
  -- de pago y el cliente. En cualquier otro caso, solo cancelar.
  v_is_owner := exists (
    select 1 from courts c join venues v on v.id = c.venue_id
    where c.id = old.court_id and v.owner_id = auth.uid()
  );

  if old.source = 'manual' and v_is_owner then
    if (to_jsonb(new) - v_owner_manual_keys) is distinct from (to_jsonb(old) - v_owner_manual_keys) then
      raise exception 'No tienes permiso para modificar esos datos de la reserva.';
    end if;
    if new.payment_method is not null and new.payment_method not in ('efectivo', 'transferencia', 'pendiente') then
      raise exception 'Método de pago inválido.';
    end if;
    if new.customer_id is distinct from old.customer_id and not exists (
      select 1 from owner_customers oc where oc.id = new.customer_id and oc.owner_id = auth.uid()
    ) then
      raise exception 'Elige un cliente válido.';
    end if;
  elsif (to_jsonb(new) - v_allowed_keys) is distinct from (to_jsonb(old) - v_allowed_keys) then
    raise exception 'No tienes permiso para modificar esos datos de la reserva.';
  end if;

  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'Solo puedes cancelar la reserva; el pago se confirma automáticamente.';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_booking_integrity() from public, anon, authenticated;
