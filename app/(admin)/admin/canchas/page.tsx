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
    .select(
      "id, name, sport, price_per_hour, is_active, is_approved, venues(name, city, owner_id, profiles:owner_id(full_name))"
    )
    .order("created_at", { ascending: false });

  async function aprobarCancha(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const id = String(formData.get("id"));
    await supabase.from("courts").update({ is_approved: true }).eq("id", id);
    redirect("/admin/canchas");
  }

  async function rechazarCancha(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const id = String(formData.get("id"));
    // "Rechazar" no aprueba y además la desactiva, para que quede claro que
    // no debe mostrarse — el dueño puede corregirla y quedará pendiente de
    // revisión otra vez cuando la reactive.
    await supabase.from("courts").update({ is_approved: false, is_active: false }).eq("id", id);
    redirect("/admin/canchas");
  }

  async function toggleActive(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const id = String(formData.get("id"));
    const isActive = formData.get("is_active") === "true";
    await supabase.from("courts").update({ is_active: !isActive }).eq("id", id);
    redirect("/admin/canchas");
  }

  const pendientes = (courts ?? []).filter((c) => !c.is_approved);
  const revisadas = (courts ?? []).filter((c) => c.is_approved);

  const renderCancha = (c: (typeof pendientes)[number], pendiente: boolean) => {
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
          <p className="text-sm text-ink-500">${c.price_per_hour.toLocaleString("es-CO")}/hora</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pendiente ? (
            <>
              <span className="badge bg-amber-50 text-amber-700">⏳ Pendiente</span>
              <form action={aprobarCancha}>
                <input type="hidden" name="id" value={c.id} />
                <button className="btn-primary !px-3 !py-1.5 text-sm">✓ Aprobar</button>
              </form>
              <form action={rechazarCancha}>
                <input type="hidden" name="id" value={c.id} />
                <button className="btn-secondary !px-3 !py-1.5 text-sm text-red-700">Rechazar</button>
              </form>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin/canchas">
      <h1 className="text-2xl font-bold text-ink-900">Canchas pendientes de aprobación</h1>
      <p className="text-ink-500">
        Ninguna cancha nueva aparece en el sitio hasta que la apruebes aquí — así evitamos que se
        publique contenido sin revisar.
      </p>

      <div className="card mt-4 divide-y divide-ink-100">
        {pendientes.map((c) => renderCancha(c, true))}
        {!pendientes.length && (
          <p className="p-8 text-center text-sm text-ink-400">No hay canchas pendientes de revisión. 🎉</p>
        )}
      </div>

      <h2 className="mt-10 text-xl font-bold text-ink-900">Canchas ya aprobadas</h2>
      <p className="text-ink-500">Puedes desactivar una cancha si incumple las reglas de la plataforma.</p>

      <div className="card mt-4 divide-y divide-ink-100">
        {revisadas.map((c) => renderCancha(c, false))}
        {!revisadas.length && (
          <p className="p-8 text-center text-sm text-ink-400">Todavía no hay canchas aprobadas.</p>
        )}
      </div>
    </DashboardShell>
  );
}
