import Link from "next/link";
import { Buildings } from "@phosphor-icons/react/ssr";
import { DashboardShell, StatCard } from "@/components/dashboard-shell";
import { requireOwner } from "@/lib/guards";
import { OWNER_LINKS as LINKS } from "@/lib/owner-links";
import { loadOwnerData } from "@/lib/owner-data";
import {
  buildAlerts,
  computeKpis,
  delta,
  occupancyHeatmap,
  parsePeriod,
  perCourt,
  scheduledIncome,
  summarizeCustomers,
  weeklyIncome,
} from "@/lib/owner-metrics";
import {
  AlertList,
  DeltaBadge,
  KpiCard,
  OccupancyHeatmap,
  PeriodTabs,
  WeeklyIncomeChart,
  fmtCOP,
  fmtPct,
} from "@/components/owner/kpi-widgets";

export default async function PanelOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo } = await searchParams;
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

  // "Por cobrar": mismo criterio que /panel/pagos — reservas en línea ya
  // jugadas (confirmadas con hora pasada). Antes filtraba status "completed",
  // que nada asigna, y siempre mostraba $0. Las reservas manuales no cuentan:
  // ese dinero lo cobró el dueño directamente.
  const { data: pendientesPago } = await supabase
    .from("bookings")
    .select("owner_payout_amount")
    .in("court_id", courtIds.length ? courtIds : ["00000000-0000-0000-0000-000000000000"])
    .in("status", ["confirmed", "completed"])
    .eq("source", "online")
    .lt("start_at", new Date().toISOString());

  const saldoPendiente = (pendientesPago ?? []).reduce(
    (sum, b) => sum + Number(b.owner_payout_amount),
    0
  );

  // ===== Indicadores del negocio (06/10/2026) =====
  const now = new Date();
  const period = parsePeriod(periodo, now);
  const historySince = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const data = await loadOwnerData(supabase, user.id, historySince);
  const k = computeKpis(data.bookings, data.courts, data.schedules, data.closures, period.start, period.end, now);
  const kPrev = computeKpis(data.bookings, data.courts, data.schedules, data.closures, period.prevStart, period.prevEnd, now);
  const agendado = scheduledIncome(data.bookings, now);
  const semanas = weeklyIncome(data.bookings, 8, now);
  const heat = occupancyHeatmap(data.bookings, data.courts, data.schedules, data.closures, period.start, period.end, now);
  const clientes = summarizeCustomers(data.bookings, now);
  const alertas = buildAlerts({
    bookings: data.bookings,
    courts: data.courts,
    schedules: data.schedules,
    heat,
    customers: clientes,
    now,
  });
  const porCancha =
    data.courts.length > 1
      ? perCourt(data.bookings, data.courts, data.schedules, data.closures, period.start, period.end, now)
      : [];

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

      {!!courtCount && (
        <section className="mt-8 flex flex-col gap-4" aria-labelledby="kpis-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="kpis-title" className="text-lg font-bold text-ink-900">
                Indicadores del negocio
              </h2>
              <p className="text-sm text-ink-500">
                {period.label[0].toUpperCase() + period.label.slice(1)}, comparado con el periodo anterior.
              </p>
            </div>
            <PeriodTabs current={period.key} />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Ingresos netos para ti"
              value={fmtCOP(k.netIncome)}
              delta={<DeltaBadge value={delta(k.netIncome, kPrev.netIncome, "pct")} />}
              hint="Reservas jugadas, después de la comisión"
            />
            <KpiCard
              label="Ocupación"
              value={fmtPct(k.occupancy)}
              bar={k.occupancy}
              delta={<DeltaBadge value={delta(k.occupancy, kPrev.occupancy, "pts")} unit=" pts" />}
              hint={`${k.bookedHours} de ${k.openHours} horas abiertas`}
            />
            <KpiCard
              label="Reservas jugadas"
              value={String(k.confirmed)}
              delta={<DeltaBadge value={delta(k.confirmed, kPrev.confirmed, "abs")} unit="" />}
              hint={k.manualCount ? `Incluye ${k.manualCount} manual(es)` : "En línea y manuales"}
            />
            <KpiCard
              label="Ticket promedio"
              value={k.avgTicket == null ? "—" : fmtCOP(k.avgTicket)}
              delta={<DeltaBadge value={delta(k.avgTicket, kPrev.avgTicket, "pct")} />}
              hint="Valor por reserva"
            />
            <KpiCard
              label="Tasa de cancelación"
              value={fmtPct(k.cancellationRate)}
              delta={
                <DeltaBadge value={delta(k.cancellationRate, kPrev.cancellationRate, "pts")} unit=" pts" goodWhenUp={false} />
              }
              hint={
                k.cancelled
                  ? `${k.cancelled} cancelada(s)${k.topCancelReason ? ` · motivo más común: ${k.topCancelReason}` : ""}`
                  : "Sin cancelaciones"
              }
            />
            <KpiCard
              label="Pagos no completados"
              value={String(k.unpaid)}
              delta={<DeltaBadge value={delta(k.unpaid, kPrev.unpaid, "abs")} unit="" goodWhenUp={false} />}
              hint="Apartaron cupo y no pagaron a tiempo"
            />
            <KpiCard
              label="Clientes recurrentes"
              value={fmtPct(k.recurringRate)}
              delta={<DeltaBadge value={delta(k.recurringRate, kPrev.recurringRate, "pts")} unit=" pts" />}
              hint={`${k.recurring} de ${k.customers} cliente(s) ya habían jugado antes`}
            />
            <KpiCard
              label="Ya agendado (30 días)"
              value={fmtCOP(agendado.amount)}
              hint={`${agendado.count} reserva(s) confirmada(s) por jugar`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="card p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-ink-900">Ingresos por semana</h3>
                <span className="text-xs text-ink-400">Últimas 8 semanas · netos</span>
              </div>
              <div className="mt-2">
                <WeeklyIncomeChart weeks={semanas} />
              </div>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-ink-900">Para actuar hoy</h3>
              <div className="mt-3">
                <AlertList alerts={alertas} />
              </div>
            </div>
          </div>

          <div className={`grid grid-cols-1 gap-4 ${porCancha.length ? "lg:grid-cols-[1.4fr_1fr]" : ""}`}>
            <div className="card p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-ink-900">¿Cuándo se llena tu cancha?</h3>
                <span className="text-xs text-ink-400">% ocupación · {period.label}</span>
              </div>
              <div className="mt-3">
                <OccupancyHeatmap cells={heat.cells} minHour={heat.minHour} maxHour={heat.maxHour} />
              </div>
            </div>
            {!!porCancha.length && (
              <div className="card p-5">
                <h3 className="font-semibold text-ink-900">Por cancha</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-ink-400">
                        <th className="py-2 font-medium">Cancha</th>
                        <th className="py-2 font-medium">Ingresos</th>
                        <th className="py-2 font-medium">Ocupación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 tabular-nums">
                      {porCancha.map((c) => (
                        <tr key={c.id}>
                          <td className="py-2 text-ink-700">{c.name}</td>
                          <td className="py-2 text-ink-900">{fmtCOP(c.income)}</td>
                          <td className="py-2 text-ink-900">{fmtPct(c.occupancy)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

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
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Buildings weight="duotone" size={28} />
          </span>
          <p className="text-ink-600">Aún no has publicado ninguna cancha.</p>
          <Link href="/panel/canchas/nueva" className="btn-primary">
            Publicar mi primera cancha
          </Link>
        </div>
      )}
    </DashboardShell>
  );
}
