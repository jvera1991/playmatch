-- Auditoría de seguridad 06/10/2026 (OWASP A01 Broken Access Control).
--
-- HALLAZGO CRÍTICO: las políticas RLS de "bookings" permitían que un
-- jugador, llamando directamente a la API de Supabase (sin pasar por la app):
--   * INSERTAR una reserva con status='confirmed' y total_price=0, en
--     cualquier cancha y horario, sin pagar;
--   * ACTUALIZAR su propia reserva a status='confirmed' sin pagar, o cambiar
--     precio, horario, cancha o incluso player_id;
-- y que un dueño de cancha modificara owner_payout_amount de sus reservas
-- (cobrarle a Playmatch más de lo debido).
--
-- Corrección: trigger BEFORE INSERT/UPDATE que hace de la base de datos la
-- autoridad. Las peticiones del sistema (service role: webhook de Wompi,
-- liberación de cupos, cron) y del admin no se restringen.

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
  v_rate constant numeric := 10; -- mantener igual a COMMISSION_RATE en app/api/bookings/route.ts
  v_allowed_keys constant text[] := array['status', 'cancellation_reason', 'cancelled_at', 'cancelled_by'];
begin
  -- Sistema (service role, sin usuario) o administrador: sin restricciones.
  if auth.uid() is null or public.current_role() = 'admin' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Toda reserva creada por un usuario nace pendiente de pago, sin rastros
    -- de pagos, recordatorios ni cancelaciones.
    new.status := 'pending_payment';
    new.wompi_transaction_id := null;
    new.reminder_sent_at := null;
    new.cancellation_reason := null;
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.created_at := now();

    select c.id, c.price_per_hour, c.slot_duration_minutes, c.is_active, c.is_approved
      into v_court
      from courts c where c.id = new.court_id;

    if not found or not v_court.is_active or not v_court.is_approved then
      raise exception 'Esta cancha no está disponible para reservas.';
    end if;

    if new.start_at is null or new.end_at is null or new.end_at <= new.start_at then
      raise exception 'Horario de reserva inválido.';
    end if;

    if new.start_at < now() then
      raise exception 'No se puede reservar un horario que ya pasó.';
    end if;

    v_duration_min := extract(epoch from (new.end_at - new.start_at)) / 60;
    if v_duration_min > 8 * 60
       or mod(v_duration_min, coalesce(v_court.slot_duration_minutes, 60)) <> 0 then
      raise exception 'La duración de la reserva no es válida para esta cancha.';
    end if;

    -- Debe caer completo dentro de una franja del horario semanal del dueño
    -- (hora de Colombia; mismo criterio que lib/availability.ts).
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

    -- El precio SIEMPRE se calcula aquí, nunca se confía en el que manda el
    -- cliente.
    new.total_price := round(v_court.price_per_hour * v_duration_min / 60);
    new.commission_rate := v_rate;
    new.commission_amount := round(new.total_price * v_rate / 100);
    new.owner_payout_amount := new.total_price - new.commission_amount;
    return new;
  end if;

  -- UPDATE por jugador o dueño: lo único permitido es cancelar (status ->
  -- 'cancelled' con motivo; el trigger enforce_booking_cancellation valida
  -- el motivo y la ventana de 3 horas). Cualquier otro cambio se rechaza.
  if (to_jsonb(new) - v_allowed_keys) is distinct from (to_jsonb(old) - v_allowed_keys) then
    raise exception 'No tienes permiso para modificar esos datos de la reserva.';
  end if;

  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'Solo puedes cancelar la reserva; el pago se confirma automáticamente.';
  end if;

  return new;
end;
$$;

create or replace trigger trg_protect_booking_integrity
  before insert or update on public.bookings
  for each row execute function public.protect_booking_integrity();


-- HALLAZGO (funcional + control de acceso): el admin no podía aprobar ni
-- rechazar dueños desde /admin/duenos — la única policy de UPDATE en
-- profiles era "id = auth.uid()", así que el update afectaba 0 filas en
-- silencio. Los campos sensibles (role, is_approved_owner) siguen
-- protegidos por el trigger protect_profile_privilege_fields.
do $p$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_admin_update') then
    create policy profiles_admin_update on public.profiles
      for update
      using (public.current_role() = 'admin')
      with check (public.current_role() = 'admin');
  end if;
end
$p$;


-- HALLAZGO (funcional): registrarse eligiendo "Quiero publicar mis canchas"
-- no tenía efecto — el perfil se creaba siempre como 'player' y el update
-- posterior de la app corría sin sesión (el correo aún no está confirmado).
-- Ahora el trigger lee la preferencia de los metadatos del registro. Sigue
-- requiriendo aprobación del admin (is_approved_owner = false) para publicar.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, full_name, role, is_approved_owner)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Usuario'),
    case when new.raw_user_meta_data->>'wants_owner' = 'true' then 'owner'::user_role else 'player'::user_role end,
    false
  );
  return new;
end;
$$;


-- HALLAZGO (advisor de Supabase): las funciones de trigger seguían
-- ejecutables vía /rest/v1/rpc/... porque Postgres concede EXECUTE a PUBLIC
-- por defecto (la migración 20261004000001 solo lo revocó de anon y
-- authenticated). Los triggers no necesitan ese permiso para dispararse.
-- current_role() se mantiene ejecutable: la usan las policies de RLS.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_court_approval() from public, anon, authenticated;
revoke execute on function public.protect_profile_privilege_fields() from public, anon, authenticated;
revoke execute on function public.enforce_booking_cancellation() from public, anon, authenticated;
revoke execute on function public.protect_booking_integrity() from public, anon, authenticated;
