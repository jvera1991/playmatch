import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAdminData } from "@/lib/admin-data";
import {
  buildAdminAlerts,
  buildOwners,
  buildPlayers,
  computeAdminKpis,
  networkHeatmap,
  ownerRanking,
  shareBy,
  weeklyCommission,
} from "@/lib/admin-metrics";
import { delta, parsePeriod } from "@/lib/owner-metrics";
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

// "Indicadores de la plataforma" del Resumen admin (06/10/2026). Se agrega
// debajo de las tarjetas que ya existían; solo lectura (RLS ya deja al admin
// ver todo). Dinero = solo reservas en línea; ocupación = todas.

function Bars({ items, empty }: { items: { label: string; value: string; pct: number }[]; empty: string }) {
  if (!items.length) return <p className="py-4 text-sm text-ink-400">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0 truncate text-ink-700 sm:w-40" title={i.label}>
            {i.label}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100" aria-hidden>
            <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.max(2, Math.round(i.pct * 100))}%` }} />
          </span>
          <span className="w-16 shrink-0 text-right font-semibold tabular-nums text-ink-900">{i.value}</span>
        </li>
      ))}
    </ul>
  );
}

export async function AdminKpiSection({ supabase, periodo }: { supabase: SupabaseClient; periodo?: string }) {
  const now = new Date();
  const period = parsePeriod(periodo, now);
  const data = await loadAdminData(supabase, new Date(now.getTime() - 365 * 86_400_000));

  const k = computeAdminKpis(data, period.start, period.end, now);
  const kPrev = computeAdminKpis(data, period.prevStart, period.prevEnd, now);
  const weeks = weeklyCommission(data.bookings, 8, now);
  const heat = networkHeatmap(data, period.start, period.end, now);
  const shares = shareBy(data, period.start, period.end, now);
  const ranking = ownerRanking(data, period.start, period.end, now);
  const players = buildPlayers(data, now);
  const owners = buildOwners(data, now);
  const alerts = buildAdminAlerts({ data, kpis: k, prev: kPrev, players, owners, shares, now });

  const maxRank = Math.max(1, ...ranking.map((r) => r.amount));
  const mil = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M` : `$${Math.round(n / 1000)} mil`);

  return (
    <section className="mt-8 flex flex-col gap-4" aria-labelledby="admin-kpis-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="admin-kpis-title" className="text-lg font-bold text-ink-900">
            Indicadores de la plataforma
          </h2>
          <p className="text-sm text-ink-500">
            {period.label[0].toUpperCase() + period.label.slice(1)}, comparado con el periodo anterior. Todas las canchas.
          </p>
        </div>
        <PeriodTabs current={period.key} basePath="/admin" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Ingreso Playmatch (comisión)"
          value={fmtCOP(k.commission)}
          delta={<DeltaBadge value={delta(k.commission, kPrev.commission, "pct")} />}
          hint="Comisión de lo reservado en línea y jugado"
        />
        <KpiCard
          label="Volumen reservado (GMV)"
          value={fmtCOP(k.gmv)}
          delta={<DeltaBadge value={delta(k.gmv, kPrev.gmv, "pct")} />}
          hint="Lo que pagaron los jugadores"
        />
        <KpiCard
          label="Reservas jugadas"
          value={String(k.confirmed)}
          delta={<DeltaBadge value={delta(k.confirmed, kPrev.confirmed, "abs")} unit="" />}
          hint="En línea"
        />
        <KpiCard
          label="Ocupación de la red"
          value={fmtPct(k.occupancy)}
          bar={k.occupancy}
          delta={<DeltaBadge value={delta(k.occupancy, kPrev.occupancy, "pts")} unit=" pts" />}
          hint="Horas jugadas / horas abiertas (incluye manuales)"
        />
        <KpiCard
          label="Jugadores activos"
          value={String(k.activePlayers)}
          delta={<DeltaBadge value={delta(k.activePlayers, kPrev.activePlayers, "pct")} />}
          hint="Jugaron en el periodo"
        />
        <KpiCard
          label="Jugadores nuevos"
          value={String(k.newPlayers)}
          delta={<DeltaBadge value={delta(k.newPlayers, kPrev.newPlayers, "abs")} unit="" />}
          hint="Su primera reserva jugada"
        />
        <KpiCard
          label="Recurrencia"
          value={fmtPct(k.recurringRate)}
          delta={<DeltaBadge value={delta(k.recurringRate, kPrev.recurringRate, "pts")} unit=" pts" />}
          hint="Jugadores con 2+ reservas jugadas"
        />
        <KpiCard
          label="Pagos que no se concretan"
          value={fmtPct(k.failRate)}
          delta={<DeltaBadge value={delta(k.failRate, kPrev.failRate, "pts")} unit=" pts" goodWhenUp={false} />}
          hint="Apartaron cupo y no pagaron a tiempo"
        />
        <KpiCard
          label="Ticket promedio"
          value={k.avgTicket == null ? "—" : fmtCOP(k.avgTicket)}
          delta={<DeltaBadge value={delta(k.avgTicket, kPrev.avgTicket, "pct")} />}
          hint="Valor por reserva"
        />
        <KpiCard label="Por liquidar a dueños" value={fmtCOP(k.toPay)} hint="Jugado menos pagos registrados (estimado)" />
        <KpiCard
          label="Dueños activos"
          value={`${k.activeOwners} / ${k.totalOwners}`}
          hint="Con reservas jugadas en el periodo"
        />
        <KpiCard
          label="Canchas sin reservas"
          value={String(k.idleCourts)}
          delta={<DeltaBadge value={delta(k.idleCourts, kPrev.idleCourts, "abs")} unit="" goodWhenUp={false} />}
          hint="Activas y sin jugarse en 30 días"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-ink-900">Comisión por semana</h3>
            <span className="text-xs text-ink-400">Últimas 8 semanas</span>
          </div>
          <div className="mt-2">
            <WeeklyIncomeChart weeks={weeks} />
          </div>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-ink-900">Para actuar hoy</h3>
          <div className="mt-3">
            <AlertList alerts={alerts} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-ink-900">Cuándo se juega en toda la red</h3>
            <span className="text-xs text-ink-400">% ocupación · {period.label}</span>
          </div>
          <div className="mt-3">
            <OccupancyHeatmap cells={heat.cells} minHour={heat.minHour} maxHour={heat.maxHour} />
          </div>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-ink-900">Ranking de dueños</h3>
          <p className="mb-3 text-xs text-ink-400">Por volumen reservado · {period.label}</p>
          <Bars
            empty="Aún no hay reservas jugadas en este periodo."
            items={ranking.map((r) => ({ label: r.name, value: mil(r.amount), pct: r.amount / maxRank }))}
          />
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-ink-900">Por deporte y por zona</h3>
        <p className="mb-3 text-xs text-ink-400">Dónde está la demanda · {period.label}. La zona es el barrio que registra cada sede.</p>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Bars
            empty="Sin datos todavía."
            items={shares.sports.map((s) => ({ label: s.label, value: `${Math.round(s.pct * 100)}%`, pct: s.pct }))}
          />
          <Bars
            empty="Sin datos todavía."
            items={shares.zones.slice(0, 5).map((z) => ({ label: z.label, value: `${Math.round(z.pct * 100)}%`, pct: z.pct }))}
          />
        </div>
      </div>
    </section>
  );
}
