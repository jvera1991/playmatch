import Link from "next/link";
import { requestPasswordReset } from "../actions";

export default function RecuperarPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-glow px-4">
      <div className="card w-full max-w-sm animate-fade-up p-8">
        <div className="mb-6 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient font-bold text-white shadow-soft">
            P
          </span>
          <h1 className="mt-3 text-xl font-bold text-ink-900">Recuperar contraseña</h1>
          <p className="mt-2 text-sm text-ink-500">
            Escribe el correo con el que te registraste y te mandamos un enlace para
            crear una contraseña nueva.
          </p>
        </div>

        <form action={requestPasswordReset} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ink-700">Correo</label>
            <input type="email" name="email" required autoComplete="email" className="input mt-1" />
          </div>
          <button className="btn-primary w-full">Enviar enlace</button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-500">
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Volver a ingresar
          </Link>
        </p>
      </div>
    </main>
  );
}
