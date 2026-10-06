import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicOrigin, safeNextPath } from "@/lib/public-url";

// Supabase redirige aquí después de que el usuario confirma su correo
// (registro). Usa el dominio público para redirigir (ver lib/public-url.ts:
// request.url trae el nombre interno del contenedor en producción) y valida
// "next" para que no se pueda usar como redirección a otro sitio.
export async function GET(request: NextRequest) {
  const origin = getPublicOrigin(request);
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("El enlace expiró o ya se usó. Intenta iniciar sesión o solicita uno nuevo.")}`
      );
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
