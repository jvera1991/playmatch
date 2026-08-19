-- Indica si la cancha es techada (cubierta) o al aire libre. Relevante en
-- Medellín por la lluvia — muchos jugadores filtran por esto.
alter table public.courts add column if not exists is_covered boolean not null default false;
