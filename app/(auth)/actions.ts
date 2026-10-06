"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/rate-limit";
import { headers, cookies } from "next/headers";
import { RECOVERY_COOKIE, safeNextPath } from "@/lib/public-url";

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  // safeNextPath: evita que ?next=//otro-sitio.com mande al usuario fuera de
  // Playmatch después de iniciar sesión (open redirect).
  const next = safeNextPath(String(formData.get("next") || "/"));

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  }

  // Un inicio de sesión normal con contraseña reemplaza cualquier sesión de
  // recuperación pendiente en este navegador.
  (await cookies()).delete(RECOVERY_COOKIE);
  redirect(next);
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const full_name = String(formData.get("full_name") || "").trim().slice(0, 120);
  const wants_owner = formData.get("role") === "owner";

  if (password.length < 8) {
    redirect(`/registro?error=${encodeURIComponent("La contraseña debe tener al menos 8 caracteres.")}`);
  }

  // La preferencia de ser dueño viaja en los metadatos del registro y la
  // aplica el trigger handle_new_user al crear el perfil (migración
  // 20261006000001). Antes se intentaba con un update después del signUp,
  // pero en ese momento no hay sesión (falta confirmar el correo) y no tenía
  // efecto. El dueño igual queda pendiente de aprobación del admin.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, wants_owner },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/registro?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/registro/revisa-tu-correo");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(RECOVERY_COOKIE);
  redirect("/");
}

// Botón "Cancelar" del formulario de nueva contraseña: descarta la sesión de
// recuperación sin cambiar nada.
export async function cancelPasswordRecovery() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(RECOVERY_COOKIE);
  redirect("/login");
}

// Límite defensivo para el formulario de "olvidé mi contraseña": sin esto,
// cualquiera podría escribir un script que mande el formulario en bucle y (a)
// inunde de correos a una bandeja ajena, o (b) use el tiempo de respuesta para
// adivinar qué correos están registrados (enumeración de usuarios). 5
// solicitudes cada 15 minutos por IP alcanza de sobra para un uso legítimo.
const RESET_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };

async function getRequestIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip")?.trim() ?? "unknown";
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") || "").trim();

  const ip = await getRequestIp();
  const rate = checkRateLimit(`password-reset:${ip}`, RESET_RATE_LIMIT);

  // Importante: SIEMPRE redirigimos al mismo "revisa tu correo" exista o no
  // esa cuenta, y aunque el rate limit haya bloqueado la solicitud. Si
  // respondiéramos distinto según el caso, cualquiera podría usar este
  // formulario para averiguar qué correos están registrados en Playmatch
  // (enumeración de usuarios) — Supabase ya se comporta así por defecto, pero
  // lo reforzamos aquí para no romper esa garantía con nuestro propio rate
  // limit.
  if (email && rate.allowed) {
    const supabase = await createClient();
    // Apunta a la ruta dedicada /auth/recuperar-callback (Route Handler, no
    // una página normal) — ahí se intercambia el código por una sesión real
    // ANTES de llegar al formulario de nueva contraseña. Ver el comentario
    // completo en app/auth/recuperar-callback/route.ts sobre por qué tiene
    // que ser así y no un "?next=..." sobre /auth/callback.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/recuperar-callback`,
    });
  }

  redirect("/recuperar/revisa-tu-correo");
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  const supabase = await createClient();

  // Solo funciona con la sesión creada por el link de recuperación (ver
  // app/auth/recuperar-callback/route.ts).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    (await cookies()).delete(RECOVERY_COOKIE);
    redirect("/login?error=" + encodeURIComponent("El enlace expiró o ya se usó. Solicita uno nuevo."));
  }

  if (password.length < 8) {
    redirect(`/actualizar-contrasena?error=${encodeURIComponent("La contraseña debe tener al menos 8 caracteres.")}`);
  }
  if (password !== confirm) {
    redirect(`/actualizar-contrasena?error=${encodeURIComponent("Las contraseñas no coinciden.")}`);
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/actualizar-contrasena?error=${encodeURIComponent(error.message)}`);
  }

  // Contraseña cambiada: se cierra la sesión de recuperación y se pide entrar
  // con la contraseña nueva. Así la sesión obtenida por el link del correo
  // nunca se convierte en una sesión normal de navegación.
  await supabase.auth.signOut();
  (await cookies()).delete(RECOVERY_COOKIE);
  redirect("/login?reset=ok");
}
