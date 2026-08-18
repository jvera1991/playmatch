-- El trigger que crea el perfil automáticamente al registrarse nunca quedó
-- conectado a auth.users (la función public.handle_new_user() existía, pero
-- sin trigger que la disparara). Efecto: cada cuenta nueva se creaba en
-- auth.users sin fila correspondiente en public.profiles, dejando a la app
-- sin saber el rol/nombre del usuario (navbar roto, sin acceso a paneles).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: crea el perfil faltante para las cuentas que ya se registraron
-- mientras el trigger no existía.
insert into public.profiles (id, full_name)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', 'Usuario')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
