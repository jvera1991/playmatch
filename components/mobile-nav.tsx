"use client";

import { useState } from "react";
import Link from "next/link";

const ROLE_LABEL: Record<string, string> = {
  player: "Jugador",
  owner: "Dueño",
  admin: "Admin",
};

// Menú de hamburguesa para pantallas pequeñas — el navbar de escritorio
// oculta varios enlaces en móvil (sm:inline-block); este componente los
// reagrupa en un panel desplegable para que sigan siendo accesibles.
export function MobileNav({
  isLoggedIn,
  role,
  fullName,
  onSignOut,
}: {
  isLoggedIn: boolean;
  role: string | null;
  fullName: string | null;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-50"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-0 top-[57px] z-30 animate-fade-in border-b border-ink-100 bg-white p-4 shadow-lift">
          <nav className="flex flex-col gap-1 text-sm">
            <Link href="/buscar" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 font-medium text-ink-700 hover:bg-ink-50">
              Buscar canchas
            </Link>
            <Link href="/mapa" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 font-medium text-ink-700 hover:bg-ink-50">
              Mapa
            </Link>

            {!isLoggedIn && (
              <>
                <Link href="/login" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 font-medium text-ink-700 hover:bg-ink-50">
                  Ingresar
                </Link>
                <Link href="/registro" onClick={() => setOpen(false)} className="btn-primary mt-2 text-center">
                  Publicar mi cancha
                </Link>
              </>
            )}

            {isLoggedIn && (
              <>
                <Link href="/reservas" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 font-medium text-ink-700 hover:bg-ink-50">
                  Mis reservas
                </Link>
                {role === "owner" && (
                  <Link href="/panel" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 font-medium text-ink-700 hover:bg-ink-50">
                    Mi panel
                  </Link>
                )}
                {role === "admin" && (
                  <Link href="/admin" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 font-medium text-ink-700 hover:bg-ink-50">
                    Admin
                  </Link>
                )}
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                    {fullName?.[0]?.toUpperCase() ?? "?"}
                  </span>
                  <span className="text-xs text-ink-600">
                    {fullName?.split(" ")[0]} ·{" "}
                    <span className="text-ink-400">{role ? ROLE_LABEL[role] : ""}</span>
                  </span>
                </div>
                <form action={onSignOut}>
                  <button className="btn-secondary mt-2 w-full">Salir</button>
                </form>
              </>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
