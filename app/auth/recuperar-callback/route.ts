import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicOrigin, RECOVERY_COOKIE } from "@/lib/public-url";

// Ruta dedicada SOLO para el link de recuperación de contraseña del correo.
//
// 1. Supabase redirige aquí con "?code=...". Se intercambia por una sesión en
//    un Route Handler (no en una página) porque solo aquí Next.js permite
//    guardar la cookie de sesión.
// 2. Se marca la sesión como "en recuperación" (cookie RECOVERY_COOKIE). Con
//    esa marca el middleware bloquea todo el sitio excepto el formulario de
//    nueva contraseña: una sesión obtenida por link de recuperación NO sirve
//    para navegar la cuenta hasta que se defina la contraseña nueva.
// 3. Se redirige usando el dominio público (getPublicOrigin), nunca
//    request.url — ver lib/public-url.ts para el bug que eso causaba.
export async function GET(request: NextRequest) {
  const origin = getPublicOrigin(request);
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Enlace de recuperación inválido. Solicita uno nuevo.")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Pasa si el link ya se usó (por ejemplo, el navegador lo abrió dos
    // veces en perfiles distintos), si venció (1 hora), o si se abrió en un
    // navegador distinto al que pidió la recuperación.
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        "El enlace de recuperación expiró, ya se usó, o se abrió en un navegador distinto al que lo pidió. Solicita uno nuevo y ábrelo en el mismo navegador."
      )}`
    );
  }

  const response = NextResponse.redirect(`${origin}/actualizar-contrasena`);
  response.cookies.set(RECOVERY_COOKIE, "1", {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // se borra antes al cambiar la contraseña o cancelar
  });
  return response;
}
