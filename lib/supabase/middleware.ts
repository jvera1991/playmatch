import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { RECOVERY_COOKIE } from "@/lib/public-url";

// Refresca la sesión de Supabase en cada request y protege rutas privadas.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Sesión obtenida con un link de "olvidé mi contraseña": mientras no se
  // defina la contraseña nueva, solo se permite el formulario para hacerlo.
  // Sin esto, alguien podía abrir el link, salirse del formulario y quedar
  // navegando la cuenta sin haber puesto contraseña (reportado en producción).
  if (request.cookies.get(RECOVERY_COOKIE)) {
    if (!user) {
      response.cookies.delete(RECOVERY_COOKIE);
    } else if (
      path !== "/actualizar-contrasena" &&
      !path.startsWith("/auth/") &&
      !path.startsWith("/api/")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/actualizar-contrasena";
      url.search = "";
      const redirect = NextResponse.redirect(url);
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
  }

  const isPrivate = path.startsWith("/panel") || path.startsWith("/admin");

  if (isPrivate && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return response;
}
