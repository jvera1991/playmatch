-- Formato/tamaño de la cancha (ej. "5 vs 5", "Dobles", "Vóley playa"). Texto
-- libre validado por una lista fija en la app (lib/court-sizes.ts) — no un
-- enum de base de datos, para poder ajustar las opciones sin migración.
alter table public.courts add column if not exists size text;
