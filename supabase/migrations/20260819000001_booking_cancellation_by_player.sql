-- Permite que el jugador cancele su propia reserva, exigiendo un motivo y
-- respetando una ventana mínima de 3 horas antes del inicio. La política de
-- update ya existente (bookings_update_involved) permite que el jugador
-- actualice su propia reserva; este trigger agrega las reglas de negocio a
-- nivel de base de datos (no solo en el formulario) para que no se puedan
-- saltar llamando a la API directamente.
alter table public.bookings add column if not exists cancellation_reason text;
alter table public.bookings add column if not exists cancelled_at timestamptz;
alter table public.bookings add column if not exists cancelled_by uuid references public.profiles(id);

create or replace function public.enforce_booking_cancellation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    if auth.uid() is null then
      -- Proceso automático del sistema (ej. liberar cupos "pending_payment"
      -- abandonados sin pago a tiempo) — no aplica ni el motivo obligatorio
      -- ni la ventana de 3 horas, porque no lo inició un jugador.
      if new.cancellation_reason is null or btrim(new.cancellation_reason) = '' then
        new.cancellation_reason := 'Cupo liberado automáticamente: no se completó el pago a tiempo.';
      end if;
    else
      if new.cancellation_reason is null or btrim(new.cancellation_reason) = '' then
        raise exception 'Debes indicar un motivo de cancelación.';
      end if;
      -- Solo restringimos la ventana de 3 horas cuando quien cancela es el
      -- jugador dueño de la reserva. El dueño de la cancha o un admin pueden
      -- necesitar cancelar en cualquier momento (mantenimiento, etc.).
      if new.player_id = auth.uid() and public.current_role() = 'player' then
        if now() > (old.start_at - interval '3 hours') then
          raise exception 'Ya no puedes cancelar esta reserva — faltan menos de 3 horas para que empiece.';
        end if;
      end if;
    end if;
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_booking_cancellation on public.bookings;
create trigger trg_enforce_booking_cancellation
before update on public.bookings
for each row execute function public.enforce_booking_cancellation();
