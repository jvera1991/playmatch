import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { MobileNav } from "@/components/mobile-nav";

const ROLE_LABEL: Record<string, string> = {
  player: "Jugador",
  owner: "Dueño",
  admin: "Admin",
};

export async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { role: string; full_name: string } | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100/80 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-soft">
            P
          </span>
          <span className="bg-brand-gradient bg-clip-text text-transparent">Playmatch</span>
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/buscar"
            className="hidden rounded-lg px-3 py-2 font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 sm:inline-block"
          >
            Buscar canchas
          </Link>
          <Link
            href="/mapa"
            className="hidden rounded-lg px-3 py-2 font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 sm:inline-block"
          >
            Mapa
          </Link>

          {!user && (
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
              >
                Ingresar
              </Link>
              <Link href="/registro" className="btn-primary !px-4 !py-2 text-sm">
                Publicar mi cancha
              </Link>
            </div>
          )}

          {user && profile && (
            <div className="hidden items-center gap-1.5 sm:flex">
              <Link
                href="/reservas"
                className="rounded-lg px-3 py-2 font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
              >
                Mis reservas
              </Link>
              {profile.role === "owner" && (
                <Link
                  href="/panel"
                  className="rounded-lg px-3 py-2 font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
                >
                  Mi panel
                </Link>
              )}
              {profile.role === "admin" && (
                <Link
                  href="/admin"
                  className="rounded-lg px-3 py-2 font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
                >
                  Admin
                </Link>
              )}
              <div className="ml-1 flex items-center gap-2 rounded-full bg-ink-50 py-1 pl-1 pr-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {profile.full_name?.[0]?.toUpperCase() ?? "?"}
                </span>
                <span className="text-xs text-ink-600">
                  {profile.full_name?.split(" ")[0]} ·{" "}
                  <span className="text-ink-400">{ROLE_LABEL[profile.role]}</span>
                </span>
              </div>
              <form action={signOut}>
                <button className="btn-secondary !px-3 !py-2 text-sm">Salir</button>
              </form>
            </div>
          )}

          <MobileNav
            isLoggedIn={!!user}
            role={profile?.role ?? null}
            fullName={profile?.full_name ?? null}
            onSignOut={signOut}
          />
        </nav>
      </div>
    </header>
  );
}
