import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Server-side guard reutilizable para las rutas de /panel (dueño) y /admin.
// La seguridad real vive en RLS (base de datos) — esto es solo para dar una
// buena experiencia (redirigir o mostrar un mensaje claro) en vez de una
// pantalla vacía o un error crudo.
export async function requireOwner(nextPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${nextPath}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_approved_owner")
    .eq("id", user.id)
    .single();

  return { supabase, user, profile };
}

export async function requireAdmin(nextPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${nextPath}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single();

  return { supabase, user, profile };
}
