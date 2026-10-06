import type { NextRequest } from "next/server";

// URL pública real del sitio (ej. https://playmatch-app.w1hlox.easypanel.host).
//
// NUNCA usar `new URL(request.url).origin` para armar redirecciones: en
// producción Next.js corre dentro de un contenedor Docker detrás del proxy de
// EasyPanel, y ahí `request.url` trae el nombre INTERNO del contenedor (ej.
// https://134e426ea6db:3000), no el dominio público. Eso rompió el link de
// recuperación de contraseña en producción: el usuario quedaba con sesión
// iniciada pero era redirigido a una dirección inexistente.
//
// Orden de preferencia:
// 1. NEXT_PUBLIC_APP_URL (configurada en EasyPanel) — fuente confiable.
// 2. Cabeceras del proxy (X-Forwarded-Host/Proto) — solo como respaldo.
// 3. El origin de la petición — último recurso (desarrollo local).
export function getPublicOrigin(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
  }

  return request.nextUrl.origin;
}

// Valida un parámetro "next" para que solo permita rutas internas del sitio.
// Sin esto, un link como /auth/callback?next=@sitio-malicioso.com podría
// mandar al usuario a otro dominio después de iniciar sesión (open redirect).
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}

// Cookie que marca "esta sesión viene de un link de recuperación y todavía no
// se ha cambiado la contraseña". Mientras exista, el middleware solo deja
// entrar a /actualizar-contrasena (ver lib/supabase/middleware.ts).
export const RECOVERY_COOKIE = "pm_password_recovery";
