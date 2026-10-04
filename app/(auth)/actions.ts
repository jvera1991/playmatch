"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const next = String(formData.get("next") || "/");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const full_name = String(formData.get("full_name"));
  const wants_owner = formData.get("role") === "owner";

  const {
    data: { user },
    error,
  } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/registro?error=${encodeURIComponent(error.message)}`);
  }

  // El trigger `handle_new_user` ya creó el profile con role='player' por defecto.
  // Si pidió ser dueño, lo marcamos como 'owner' pendiente de aprobación del admin.
  if (wants_owner && user) {
    await supabase
      .from("profiles")
      .update({ role: "owner", is_approved_owner: false })
      .eq("id", user.id);
  }

  redirect("/registro/revisa-tu-correo");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
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
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/actualizar-contrasena`,
    });
  }

  redirect("/recuperar/revisa-tu-correo");
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") || "");
  const supabase = await createClient();

  // Esta acción solo funciona si el usuario llegó aquí con una sesión activa
  // creada por el link de recuperación (ver app/auth/callback/route.ts) — sin
  // eso, updateUser() falla porque no hay sesión que actualizar.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=" + encodeURIComponent("El enlace expiró o ya se usó. Solicita uno nuevo."));
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/actualizar-contrasena?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?reset=ok");
}
