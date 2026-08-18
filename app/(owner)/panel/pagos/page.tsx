import { DashboardShell, StatCard } from "@/components/dashboard-shell";
import { requireOwner } from "@/lib/guards";
import { OWNER_LINKS as LINKS } from "@/lib/owner-links";

export default async function PagosPage() {
  const { supabase, user } = await requireOwner("/panel/pagos");

  const { data: venues } = await supabase.from("venues").select("id").eq("owner_id", user.id);
  const venueIds = (venues ?? []).map((v) => v.id);

  const { data: courts } = await supabase
    .from("courts")
    .select("id")
    .in("venue_id", venueIds.length ? venueIds : ["00000000-0000-0000-0000-000000000000"]);
  const courtIds = (courts ?? []).map((c) => c.id);

  // "Por cobrar" = reservas confirmadas cuyo partido ya se jugó (start_at pasado).
  // Nota: por ahora no hay un job que las mueva a "completed" automáticamente —
  // el admin las liquida manualmente desde /admin y registra el pago en `payouts`.
  const { data: jugadas } = await supabase
    .from("bookings")
    .select("id, start_at, owner_payout_amount, courts(name)")
    .in("court_id", courtIds.length ? courtIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("status", "confirmed")
    .lt("start_at", new Date().toISOString())
    .order("start_at", { ascending: false });

  const totalPendiente = (jugadas ?? []).reduce((sum, b) => sum + Number(b.owner_payout_amount), 0);

  const { data: historial } = await supabase
    .from("payouts")
    .select("id, period_start, period_end, amount, status, paid_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <DashboardShell title="Panel del dueño" links={LINKS} activeHref="/panel/pagos">
      <h1 className="text-2xl font-bold text-ink-900">Pagos</h1>
      <p className="text-ink-500">
        Playmatch recauda el pago completo y te transfiere tu parte (descontando la
        comisión del 10%) periódicamente.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Por cobrar ahora"
          value={`$${totalPendiente.toLocaleString("es-CO")}`}
          hint={`${jugadas?.length ?? 0} reservas jugadas y aún no liquidadas`}
        />
        <StatCard
          label="Total ya pagado"
          value={`$${(historial ?? [])
            .filter((p) => p.status === "paid")
            .reduce((s, p) => s + Number(p.amount), 0)
            .toLocaleString("es-CO")}`}
        />
      </div>

      <div className="card mt-6 p-5">
        <h2 className="font-semibold text-ink-900">Reservas pendientes de liquidar</h2>
        <ul className="mt-3 divide-y divide-ink-100">
          {jugadas?.map((b) => (
            <li key={b.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-ink-700">
                {(b.courts as unknown as { name: string })?.name} —{" "}
                {new Date(b.start_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}
              </span>
              <span className="font-medium text-ink-800">
                ${Number(b.owner_payout_amount).toLocaleString("es-CO")}
              </span>
            </li>
          ))}
          {!jugadas?.length && (
            <li className="py-6 text-center text-sm text-ink-400">
              No tienes reservas jugadas pendientes de liquidar.
            </li>
          )}
        </ul>
      </div>

      <div className="card mt-5 p-5">
        <h2 className="font-semibold text-ink-900">Historial de pagos</h2>
        <ul className="mt-3 divide-y divide-ink-100">
          {historial?.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-ink-700">
                {p.period_start} → {p.period_end}
              </span>
              <span className="flex items-center gap-2">
                <span className={`badge ${p.status === "paid" ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700"}`}>
                  {p.status === "paid" ? "Pagado" : "Pendiente"}
                </span>
                <span className="font-medium text-ink-800">
                  ${Number(p.amount).toLocaleString("es-CO")}
                </span>
              </span>
            </li>
          ))}
          {!historial?.length && (
            <li className="py-6 text-center text-sm text-ink-400">Aún no hay pagos registrados.</li>
          )}
        </ul>
      </div>
    </DashboardShell>
  );
}
