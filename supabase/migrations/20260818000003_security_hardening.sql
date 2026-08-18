-- Copia versionada, aplicada en producción el 2026-08-18.
revoke execute on function public.current_role() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;

create schema if not exists extensions;
alter extension btree_gist set schema extensions;
