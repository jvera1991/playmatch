export default function RevisaTuCorreoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-glow px-4">
      <div className="card w-full max-w-sm animate-fade-up p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-2xl">
          ✉️
        </span>
        <h1 className="mt-4 text-xl font-bold text-ink-900">Revisa tu correo</h1>
        <p className="mt-2 text-sm text-ink-500">
          Te enviamos un enlace de confirmación. Ábrelo para activar tu cuenta y poder
          iniciar sesión.
        </p>
      </div>
    </main>
  );
}
