import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Ruta dedicada SOLO para el link de recuperación de contraseña del correo.
//
// Por qué existe esto separado de app/auth/callback/route.ts (que ya existía
// para la confirmación de registro): Supabase redirige aquí con "?code=..."
// en la URL — ese código hay que intercambiarlo por una sesión real ANTES de
// mostrar el formulario de "nueva contraseña". Ese intercambio tiene que
// pasar por un Route Handler como este (no por una página normal/Server
// Component) porque solo un Route Handler puede guardar la cookie de sesión
// de verdad; una página normal puede leer cookies pero Next.js no le deja
// escribirlas, así que si se hace el intercambio ahí la sesión no queda
// guardada y el siguiente paso (guardar la contraseña nueva) falla con "el
// link ya venció" aunque el código fuera válido — esto pasó en producción y
// es la razón de este archivo.
//
// También se evita a propósito pasar un "?next=..." extra en el redirectTo
// que le mandamos a Supabase (se probó en producción y Supabase a veces lo
// descarta en el camino) — en vez de eso, esta ruta ya sabe a dónde mandar
// después (/actualizar-contrasena), sin depender de ningún parámetro extra
// que pueda perderse.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("El enlace de recuperación expiró o ya se usó. Solicita uno nuevo.")}`
      );
    }
  }

  return NextResponse.redirect(`${origin}/actualizar-contrasena`);
}
