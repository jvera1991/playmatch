import { updatePassword } from "../actions";
import { createClient } from "@/lib/supabase/server";

export default async function ActualizarContrasenaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string }>;
}) {
  const { error, code } = await searchParams;

  // El link del correo de recuperación llega aquí con "?code=..." en la URL
  // (Supabase lo agrega solo). Esta página misma intercambia ese código por
  // una sesión temporal — antes eso pasaba en /auth/callback con un parámetro
  // "next", pero Supabase no siempre lo respetaba en producción (llegaba al
  // dominio correcto pero perdía el "next" y mandaba al usuario al home). Al
  // hacerlo aquí mismo evitamos depender de ese segundo parámetro.
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-glow px-4">
      <div className="card w-full max-w-sm animate-fade-up p-8">
        <div className="mb-6 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient font-bold text-white shadow-soft">
            P
          </span>
          <h1 className="mt-3 text-xl font-bold text-ink-900">Crear nueva contraseña</h1>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <form action={updatePassword} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ink-700">Nueva contraseña</label>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="input mt-1"
            />
          </div>
          <button className="btn-primary w-full">Guardar contraseña</button>
        </form>
      </div>
    </main>
  );
}
