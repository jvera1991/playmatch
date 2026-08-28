-- Auditoría de seguridad (28/08/2026): cierra una escalada de privilegios
-- crítica y endurece la subida de fotos de canchas.

-- =========================================================================
-- 1) CRÍTICO: profiles_update_own no tenía "with check", así que cualquier
--    usuario autenticado podía, con una llamada directa a la API de
--    Supabase (sin pasar por la UI), poner su propio role='admin' o
--    is_approved_owner=true y saltarse por completo el sistema de
--    aprobación de administrador. Igual que ya se hace para "courts" y
--    "bookings", protegemos los campos sensibles con un trigger BEFORE
--    UPDATE que los repone a su valor anterior salvo que quien edite sea
--    admin.
-- =========================================================================

create or replace function public.protect_profile_privilege_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if public.current_role() <> 'admin' then
    new.role := old.role;
    new.is_approved_owner := old.is_approved_owner;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privilege_fields on public.profiles;
create trigger protect_profile_privilege_fields
  before update on public.profiles
  for each row
  execute function public.protect_profile_privilege_fields();

-- =========================================================================
-- 2) MEDIO: el bucket "court-photos" no tenía límite de tamaño ni de tipos
--    de archivo permitidos a nivel de Storage — la validación de
--    components/photo-uploader.tsx es solo en el navegador y se puede
--    saltar con una llamada directa a la API. Como el bucket es público,
--    esto permitía subir archivos arbitrarios (ej. un SVG con script, o
--    archivos pesados) usando la sesión de cualquier dueño aprobado.
-- =========================================================================

update storage.buckets
set file_size_limit = 5242880, -- 5 MB, igual al límite ya anunciado en la UI
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'court-photos';
