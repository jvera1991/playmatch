import Link from "next/link";
import { signIn } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-glow px-4">
      <div className="card w-full max-w-sm animate-fade-up p-8">
        <div className="mb-6 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient font-bold text-white shadow-soft">
            P
          </span>
          <h1 className="mt-3 text-xl font-bold text-ink-900">Ingresar a Playmatch</h1>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <form action={signIn} className="space-y-4">
          <input type="hidden" name="next" value={next || "/"} />
          <div>
            <label className="text-sm font-medium text-ink-700">Correo</label>
            <input type="email" name="email" required className="input mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-700">Contraseña</label>
            <input type="password" name="password" required className="input mt-1" />
          </div>
          <button className="btn-primary w-full">Ingresar</button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-500">
          ¿No tienes cuenta?{" "}
          <Link href="/registro" className="font-medium text-brand-700 hover:underline">
            Regístrate
          </Link>
        </p>
      </div>
    </main>
  );
}
