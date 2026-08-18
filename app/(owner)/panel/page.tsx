import Link from "next/link";
import { DashboardShell, StatCard } from "@/components/dashboard-shell";
import { requireOwner } from "@/lib/guards";
import { OWNER_LINKS as LINKS } from "@/lib/owner-links";

export default async function PanelOverviewPage() {
  const { supabase, user, profile } = await requireOwner("/panel");

  if (!profile || profile.role !== "owner") {
    return (
      <DashboardShell title="Panel del dueño" links={LINKS} activeHref="/panel">
        <div className="card p-8 text-center">
          <p className="text-ink-600">Esta sección es solo para dueños de cancha.</p>
        </div>
      </DashboardShell>
    );
  }

  if (!profile.is_approved_owner) {
    return (
      <DashboardShell title="Panel del dueño" links={LINKS} activeHref="/panel">
        <div className="card animate-fade-up p-8 text-center">
          <span className="text-4xl">⏳</span>
          <h1 className="mt-3 text-lg font-bold text-ink-900">
            Tu cuenta de dueño está en revisión
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Un administrador de Playmatch tiene que aprobar tu cuenta antes de que puedas
            publicar canchas. Esto suele tomar menos de 24 horas.
          </p>
        </div>
      </DashboardShell>
    );
  }

  const { data: venues } = await supabase.from("venues").select("id").eq("owner_id", user.id);
  const venueIds = (venues ?? []).map((v) => v.id);

  const { count: courtCount } = await supabase
    .from("courts")
    .select("id", { count: "exact", head: true })
    .in("venue_id", venueIds.length ? venueIds : ["00000000-0000-0000-0000-000000000000"]);

  const { data: courtRows } = await supabase
    .from("courts")
    .select("id")
    .in("venue_id", venueIds.length ? venueIds : ["00000000-0000-0000-0000-000000000000"]);
  const courtIds = (courtRows ?? []).map((c) => c.id);

  const { data: proximasReservas } = await supabase
    .from("bookings")
    .select("id, start_at, total_price, owner_payout_amount, status, courts(name)")
    .in("court_id", courtIds.length ? courtIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("status", "confirmed")
    .gte("start_at", new Date().toISOString())
    .order("start_at")
    .limit(5);

  const { data: pendientesPago } = await supabase
    .from("bookings")
    .select("owner_payout_amount")
    .in("court_id", courtIds.length ? courtIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("status", "completed");

  const saldoPendiente = (pendientesPago ?? []).reduce(
    (sum, b) => sum + Number(b.owner_payout_amount),
    0
  );

  return (
    <DashboardShell title="Panel del dueño" links={LINKS} activeHref="/panel">
      <h1 className="text-2xl font-bold text-ink-900">Hola, {profile.full_name?.split(" ")[0]} 👋</h1>
      <p className="text-ink-500">Así va tu negocio en Playmatch.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Canchas publicadas" value={String(courtCount ?? 0)} />
        <StatCard label="Próximas reservas" value={String(proximasReservas?.length ?? 0)} />
        <StatCard
          label="Por cobrar"
          value={`$${saldoPendiente.toLocaleString("es-CO")}`}
          hint="COP, ver detalle en Pagos"
        />
      </div>

      <div className="card mt-6 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink-900">Próximas reservas</h2>
          <Link href="/panel/reservas" className="text-sm font-medium text-brand-700 hover:underline">
            Ver todas
          </Link>
        </div>
        <ul className="mt-3 divide-y divide-ink-100">
          {proximasReservas?.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-3 text-sm">
              <span className="text-ink-700">
                {(r.courts as unknown as { name: string })?.name}
              </span>
              <span className="text-ink-500">
                {new Date(r.start_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}
              </span>
            </li>
          ))}
          {!proximasReservas?.length && (
            <li className="py-6 text-center text-sm text-ink-400">
              No tienes reservas próximas todavía.
            </li>
          )}
        </ul>
      </div>

      {!courtCount && (
        <div className="card mt-6 flex flex-col items-center gap-3 p-8 text-center">
          <span className="text-3xl">🏟️</span>
          <p className="text-ink-600">Aún no has publicado ninguna cancha.</p>
          <Link href="/panel/canchas/nueva" className="btn-primary">
            Publicar mi primera cancha
          </Link>
        </div>
      )}
    </DashboardShell>
  );
}
