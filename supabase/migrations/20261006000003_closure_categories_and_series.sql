-- Bloqueo de agenda desde el calendario (06/10/2026). Solo AGREGA columnas:
-- tipo de motivo y serie (bloqueos que se repiten cada semana). Cada día de
-- una serie es una fila normal de court_closures, así la disponibilidad, la
-- página pública, el chat de IA y el trigger de reservas la respetan sin
-- cambios. RLS existente (closures_owner_write) ya limita escribir/borrar al
-- dueño de la cancha.
alter table public.court_closures
  add column if not exists category text,
  add column if not exists series_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'court_closures_category_check') then
    alter table public.court_closures
      add constraint court_closures_category_check
      check (category is null or category in ('escuela', 'evento', 'torneo', 'mantenimiento', 'otro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'court_closures_reason_len') then
    alter table public.court_closures
      add constraint court_closures_reason_len check (reason is null or char_length(reason) <= 300) not valid;
  end if;
end $$;

create index if not exists idx_court_closures_series on public.court_closures (series_id) where series_id is not null;
create index if not exists idx_court_closures_court_time on public.court_closures (court_id, start_at);
