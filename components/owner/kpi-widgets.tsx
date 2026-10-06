import Link from "next/link";
import type { Alert, HeatCell } from "@/lib/owner-metrics";

// Piezas visuales del Resumen del dueño (06/10/2026). Server components
// puros: sin librerías de gráficos, SVG/CSS con la paleta brand/ink.

export const fmtCOP = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
export const fmtPct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export function DeltaBadge({
  value,
  unit = "%",
  goodWhenUp = true,
}: {
  value: number | null;
  unit?: "%" | " pts" | "";
  goodWhenUp?: boolean;
}) {
  if (value == null) return null;
  if (value === 0) {
    return <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-bold text-ink-600">= 0{unit}</span>;
  }
  const up = value > 0;
  const good = up === goodWhenUp;
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
        good ? "bg-brand-100 text-brand-800" : "bg-red-100 text-red-700"
      }`}
      title="Comparado con el periodo anterior de igual duración"
    >
      {up ? "▲" : "▼"} {Math.abs(value)}
      {unit}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  delta,
  bar,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: React.ReactNode;
  bar?: number | null;
}) {
  return (
    <div className="card flex flex-col gap-1.5 p-4">
      <p className="text-xs font-semibold text-ink-600">{label}</p>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <p className="text-lg font-bold tabular-nums text-ink-900 sm:text-xl">{value}</p>
        {delta}
      </div>
      {bar != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round(bar * 100)}%` }} />
        </div>
      )}
      {hint && <p className="text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

export function PeriodTabs({ current, basePath = "/panel" }: { current: string; basePath?: string }) {
  const opts = [
    { k: "7", label: "7 días" },
    { k: "30", label: "30 días" },
    { k: "90", label: "90 días" },
    { k: "mes", label: "Este mes" },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-xl border border-ink-200 bg-white text-xs font-semibold" role="tablist" aria-label="Periodo">
      {opts.map((o) => (
        <Link
          key={o.k}
          href={`${basePath}?periodo=${o.k}`}
          scroll={false}
          aria-selected={current === o.k}
          role="tab"
          className={`whitespace-nowrap border-l border-ink-200 px-3 py-1.5 first:border-l-0 ${
            current === o.k ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-50"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

// Barras de ingresos semanales: una serie, un tono (brand), escala única.
export function WeeklyIncomeChart({ weeks }: { weeks: { label: string; amount: number; count: number }[] }) {
  const W = 560;
  const H = 220;
  const left = 64;
  const right = 12;
  const top = 24;
  const base = 180;
  const max = Math.max(...weeks.map((w) => w.amount), 0);
  // Escala "redonda" para que las marcas del eje sean valores reales
  const steps = [100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000, 25_000_000];
  const step = steps.find((s) => s * 3 >= max) ?? steps[steps.length - 1];
  const scaleMax = step * 3;
  const y = (v: number) => base - (v / scaleMax) * (base - top);
  const slot = (W - left - right) / weeks.length;
  const bw = Math.min(40, slot - 14);
  const short = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M` : v === 0 ? "$0" : `$${Math.round(v / 1000)} mil`;
  const lastIdx = weeks.length - 1;

  return (
    <div className="overflow-x-auto">
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[480px]" role="img" aria-label="Ingresos netos por semana">
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <line
            x1={left}
            x2={W - right}
            y1={y(step * i)}
            y2={y(step * i)}
            className={i === 0 ? "stroke-ink-200" : "stroke-ink-100"}
            strokeDasharray={i === 0 ? undefined : "3 4"}
          />
          <text x={left - 8} y={y(step * i) + 4} textAnchor="end" className="fill-ink-400 text-[11px]">
            {short(step * i)}
          </text>
        </g>
      ))}
      {weeks.map((w, i) => {
        const x = left + i * slot + (slot - bw) / 2;
        const h = Math.max(0, base - y(w.amount));
        return (
          <g key={w.label}>
            <rect x={left + i * slot} y={top} width={slot} height={base - top} fill="transparent">
              <title>{`Semana del ${w.label}: ${fmtCOP(w.amount)} · ${w.count} reserva(s)`}</title>
            </rect>
            {h > 0 && (
              <path
                d={`M${x},${base} V${base - h + Math.min(4, h)} q0,-${Math.min(4, h)} ${Math.min(4, h)},-${Math.min(4, h)} H${x + bw - Math.min(4, h)} q${Math.min(4, h)},0 ${Math.min(4, h)},${Math.min(4, h)} V${base} Z`}
                className={i === lastIdx ? "fill-brand-600" : "fill-brand-300"}
                pointerEvents="none"
              />
            )}
            <text x={x + bw / 2} y={base + 18} textAnchor="middle" className="fill-ink-400 text-[10.5px]">
              {w.label}
            </text>
          </g>
        );
      })}
      {weeks[lastIdx] && weeks[lastIdx].amount > 0 && (
        <text
          x={left + lastIdx * slot + slot / 2}
          y={y(weeks[lastIdx].amount) - 8}
          textAnchor="middle"
          className="fill-ink-900 text-[11px] font-bold"
        >
          {short(weeks[lastIdx].amount)}
        </text>
      )}
    </svg>
    </div>
  );
}

// Mapa de calor: magnitud = un solo tono (brand) de claro a oscuro.
const HEAT = ["bg-ink-100", "bg-brand-100", "bg-brand-300", "bg-brand-500", "bg-brand-700"];
const HEAT_LABEL = ["Sin reservas", "Baja", "Media", "Alta", "Llena"];
const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

export function OccupancyHeatmap({
  cells,
  minHour,
  maxHour,
}: {
  cells: Map<string, HeatCell>;
  minHour: number;
  maxHour: number;
}) {
  const hours: number[] = [];
  for (let h = minHour; h <= maxHour; h++) hours.push(h);
  const level = (c?: HeatCell) => {
    if (!c || c.open <= 0) return -1;
    const occ = c.booked / c.open;
    if (occ <= 0) return 0;
    if (occ < 0.25) return 1;
    if (occ < 0.5) return 2;
    if (occ < 0.8) return 3;
    return 4;
  };
  const hourLabel = (h: number) => (h % 12 === 0 ? 12 : h % 12);

  return (
    <div>
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[420px] gap-[3px] text-[10.5px] text-ink-400"
          style={{ gridTemplateColumns: `34px repeat(${hours.length}, minmax(0, 1fr))` }}
        >
          <span />
          {hours.map((h) => (
            <span key={h} className="text-center tabular-nums">
              {hourLabel(h)}
            </span>
          ))}
          {ORDEN_DIAS.map((d) => (
            <div key={d} className="contents">
              <span className="self-center">{DIAS_CORTOS[d]}</span>
              {hours.map((h) => {
                const c = cells.get(`${d}-${h}`);
                const lv = level(c);
                const p = h >= 12 ? "p.m." : "a.m.";
                const tip =
                  lv < 0
                    ? `${DIAS_CORTOS[d]} ${hourLabel(h)} ${p}: cerrado`
                    : `${DIAS_CORTOS[d]} ${hourLabel(h)} ${p}: ${Math.round(((c!.booked) / c!.open) * 100)}% ocupado (${HEAT_LABEL[lv]})`;
                return (
                  <span
                    key={h}
                    title={tip}
                    aria-label={tip}
                    className={`block h-7 min-w-[16px] rounded ${lv < 0 ? "border border-dashed border-ink-200 bg-transparent" : HEAT[lv]}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-400">
        Menos
        {HEAT.map((c) => (
          <span key={c} className={`inline-block h-2.5 w-3.5 rounded-sm ${c}`} />
        ))}
        Más · <span className="inline-block h-2.5 w-3.5 rounded-sm border border-dashed border-ink-200" /> cerrado
      </div>
    </div>
  );
}

const TONE: Record<Alert["tone"], string> = {
  warn: "border-amber-500 bg-amber-50",
  info: "border-sky-500 bg-sky-50",
  good: "border-brand-500 bg-brand-50",
};

export function AlertList({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) {
    return <p className="py-6 text-center text-sm text-ink-400">Nada urgente por ahora.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((a) => (
        <li key={a.title} className={`flex items-start gap-3 rounded-xl border-l-4 px-3 py-2.5 ${TONE[a.tone]}`}>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-900">{a.title}</p>
            <p className="text-xs text-ink-600">{a.detail}</p>
          </div>
          {a.href && (
            <Link href={a.href} className="ml-auto whitespace-nowrap text-xs font-bold text-brand-700 hover:underline">
              {a.cta ?? "Ver"}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
