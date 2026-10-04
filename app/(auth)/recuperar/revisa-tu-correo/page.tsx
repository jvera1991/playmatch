export default function RecuperarRevisaTuCorreoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-glow px-4">
      <div className="card w-full max-w-sm animate-fade-up p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-2xl">
          ✉️
        </span>
        <h1 className="mt-4 text-xl font-bold text-ink-900">Revisa tu correo</h1>
        <p className="mt-2 text-sm text-ink-500">
          Si ese correo está registrado en Playmatch, te llegó un enlace para crear una
          contraseña nueva. Ábrelo desde el mismo dispositivo o navegador si puedes.
        </p>
        <p className="mt-4 text-xs text-ink-400">
          ¿No te llegó? Revisa la carpeta de spam, o espera unos minutos antes de
          intentar de nuevo.
        </p>
      </div>
    </main>
  );
}
