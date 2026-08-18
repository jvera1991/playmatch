import Link from "next/link";
import { signUp } from "../actions";

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-glow px-4 py-10">
      <div className="card w-full max-w-sm animate-fade-up p-8">
        <div className="mb-6 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient font-bold text-white shadow-soft">
            P
          </span>
          <h1 className="mt-3 text-xl font-bold text-ink-900">Crear cuenta en Playmatch</h1>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <form action={signUp} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ink-700">Nombre completo</label>
            <input name="full_name" required className="input mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-700">Correo</label>
            <input type="email" name="email" required className="input mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-700">Contraseña</label>
            <input type="password" name="password" required minLength={6} className="input mt-1" />
          </div>

          <fieldset className="rounded-xl border border-ink-200 p-3">
            <legend className="px-1 text-sm font-medium text-ink-700">
              ¿Cómo quieres usar Playmatch?
            </legend>
            <label className="flex items-center gap-2 py-1 text-sm text-ink-700">
              <input type="radio" name="role" value="player" defaultChecked className="accent-brand-600" />
              Quiero reservar canchas
            </label>
            <label className="flex items-center gap-2 py-1 text-sm text-ink-700">
              <input type="radio" name="role" value="owner" className="accent-brand-600" />
              Quiero publicar mis canchas (dueño)
            </label>
            <p className="mt-1 text-xs text-ink-400">
              Si eliges "dueño", un administrador debe aprobar tu cuenta antes de que puedas
              publicar. Esto evita canchas falsas en la plataforma.
            </p>
          </fieldset>

          <button className="btn-primary w-full">Crear cuenta</button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-500">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Ingresa
          </Link>
        </p>
      </div>
    </main>
  );
}
