import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireAdmin } from "@/lib/guards";

const LINKS = [
  { href: "/admin", label: "Resumen", icon: "📊" },
  { href: "/admin/duenos", label: "Dueños pendientes", icon: "🧑‍💼" },
  { href: "/admin/canchas", label: "Canchas", icon: "🏟️" },
  { href: "/admin/reservas", label: "Reservas", icon: "📅" },
  { href: "/admin/pagos", label: "Pagos a dueños", icon: "💸" },
];

const SPORT_LABEL: Record<string, string> = { futbol: "Fútbol 5", padel: "Pádel", voley: "Vóley" };

export default async function AdminCanchasPage() {
  const { supabase, profile } = await requireAdmin("/admin/canchas");

  if (profile?.role !== "admin") {
    return (
      <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin/canchas">
        <div className="card p-8 text-center">
          <p className="text-ink-600">Esta sección es solo para administradores de Playmatch.</p>
        </div>
      </DashboardShell>
    );
  }

  const { data: courts } = await supabase
    .from("courts")
    .select("id, name, sport, price_per_hour, is_active, venues(name, city, owner_id, profiles:owner_id(full_name))")
    .order("created_at", { ascending: false });

  async function toggleActive(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const id = String(formData.get("id"));
    const isActive = formData.get("is_active") === "true";
    await supabase.from("courts").update({ is_active: !isActive }).eq("id", id);
    redirect("/admin/canchas");
  }

  return (
    <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin/canchas">
      <h1 className="text-2xl font-bold text-ink-900">Todas las canchas</h1>
      <p className="text-ink-500">Puedes desactivar una cancha si incumple las reglas de la plataforma.</p>

      <div className="card mt-5 divide-y divide-ink-100">
        {courts?.map((c) => {
          const venue = c.venues as unknown as {
            name: string;
            city: string;
            profiles: { full_name: string } | null;
          };
          return (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="badge bg-brand-50 text-brand-700">{SPORT_LABEL[c.sport] ?? c.sport}</p>
                <p className="mt-1 font-medium text-ink-900">{c.name}</p>
                <p className="text-sm text-ink-500">
                  {venue?.name}, {venue?.city} · dueño: {venue?.profiles?.full_name ?? "—"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`badge ${c.is_active ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-700"}`}>
                  {c.is_active ? "Activa" : "Desactivada"}
                </span>
                <form action={toggleActive}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="is_active" value={String(c.is_active)} />
                  <button className="btn-secondary !px-3 !py-1.5 text-sm">
                    {c.is_active ? "Desactivar" : "Reactivar"}
                  </button>
                </form>
              </div>
            </div>
          );
        })}
        {!courts?.length && (
          <p className="p-8 text-center text-sm text-ink-400">Todavía no hay canchas publicadas.</p>
        )}
      </div>
    </DashboardShell>
  );
}
