-- Sesión 6 (04/10/2026) — hardening adicional encontrado al revisar los
-- advisors de Supabase (no vino del pentest externo de Argus, sino de
-- mcp__Supabase__get_advisors, como parte de una revisión de arquitectura
-- pedida por el usuario). Ya aplicada en producción directamente vía MCP;
-- este archivo la deja registrada en el repo para que el historial de
-- `supabase/migrations/` siga reflejando el estado real de la base.

-- 1) Índices en foreign keys sin cobertura. Hoy el volumen de datos es bajo
-- y no se nota, pero según crece el número de reservas/canchas estos JOINs
-- (ej. "todas las reservas de esta cancha", "todas las canchas de esta sede")
-- empiezan a hacer sequential scan en vez de usar un índice — es la causa
-- más común de que una app "que funcionaba bien" se vuelva lenta solo por
-- crecer en datos, sin que el código haya cambiado.
create index if not exists idx_bookings_cancelled_by on public.bookings (cancelled_by);
create index if not exists idx_court_closures_court_id on public.court_closures (court_id);
create index if not exists idx_court_closures_created_by on public.court_closures (created_by);
create index if not exists idx_court_photos_court_id on public.court_photos (court_id);
create index if not exists idx_court_schedules_court_id on public.court_schedules (court_id);
create index if not exists idx_courts_venue_id on public.courts (venue_id);
create index if not exists idx_notifications_log_booking_id on public.notifications_log (booking_id);
create index if not exists idx_payouts_owner_id on public.payouts (owner_id);
create index if not exists idx_venues_owner_id on public.venues (owner_id);

-- 2) Revocar EXECUTE público sobre funciones de trigger. Postgres de por sí
-- ya rechaza llamarlas directo (son `returns trigger`, solo se pueden
-- invocar desde un trigger) — así que esto no cambia comportamiento real,
-- pero evita que PostgREST las liste como endpoints RPC públicos
-- (/rest/v1/rpc/handle_new_user, etc.), que es ruido/superficie de ataque
-- innecesaria que señaló el advisor de seguridad de Supabase.
-- NOTA: current_role() NO se toca — esa sí la llaman activamente casi
-- todas las policies de RLS bajo el rol anon/authenticated (se verificó
-- antes de aplicar esta migración); revocarla habría roto el acceso a toda
-- la app.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.protect_court_approval() from anon, authenticated;
revoke execute on function public.protect_profile_privilege_fields() from anon, authenticated;
revoke execute on function public.enforce_booking_cancellation() from anon, authenticated;
