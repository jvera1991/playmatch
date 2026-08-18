import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireOwner } from "@/lib/guards";
import { OWNER_LINKS as LINKS } from "@/lib/owner-links";

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-brand-100 text-brand-800 border-brand-200",
  pending_payment: "bg-amber-100 text-amber-800 border-amber-200",
  completed: "bg-ink-100 text-ink-600 border-ink-200",
};

// Colombia es UTC-5 fijo (sin horario de verano) — mismo criterio que
// lib/availability.ts, para que el día que ve el dueño aquí coincida con el
// día en que realmente se juega el partido.
const BOGOTA_OFFSET_HOURS = -5;

function bogotaDateKey(iso: string) {
  // Truco: sumamos el offset para "ver" la hora de Bogotá en getUTC*.
  const shifted = new Date(new Date(iso).getTime() + BOGOTA_OFFSET_HOURS * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function bogotaTime(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + BOGOTA_OFFSET_HOURS * 60 * 60 * 1000);
  const h = shifted.getUTCHours();
  const m = shifted.getUTCMinutes();
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${period}`;
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const { supabase, user } = await requireOwner("/panel/calendario");

  const hoy = new Date();
  let year = hoy.getUTCFullYear();
  let month = hoy.getUTCMonth(); // 0-indexed

  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [y, m] = mes.split("-").map(Number);
    year = y;
    month = m - 1;
  }

  const primerDiaMes = new Date(Date.UTC(year, month, 1));
  const ultimoDiaMes = new Date(Date.UTC(year, month + 1, 0));

  // La cuadrícula visual arranca en domingo de la semana del día 1, y termina
  // en sábado de la semana del último día del mes.
  const inicioGrilla = new Date(primerDiaMes);
  inicioGrilla.setUTCDate(inicioGrilla.getUTCDate() - inicioGrilla.getUTCDay());
  const finGrilla = new Date(ultimoDiaMes);
  finGrilla.setUTCDate(finGrilla.getUTCDate() + (6 - finGrilla.getUTCDay()));

  const dias: Date[] = [];
  for (let d = new Date(inicioGrilla); d <= finGrilla; d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push(new Date(d));
  }

  const { data: venues } = await supabase.from("venues").select("id").eq("owner_id", user.id);
  const venueIds = (venues ?? []).map((v) => v.id);

  const { data: courtRows } = await supabase
    .from("courts")
    .select("id")
    .in("venue_id", venueIds.length ? venueIds : ["00000000-0000-0000-0000-000000000000"]);
  const courtIds = (courtRows ?? []).map((c) => c.id);

  // inicioGrilla/finGrilla representan medianoche en hora de Bogotá; como
  // Bogotá es UTC-5 fijo, la medianoche local equivale a las 05:00 UTC.
  const rangoInicio = new Date(inicioGrilla.getTime() - BOGOTA_OFFSET_HOURS * 60 * 60 * 1000);
  const rangoFin = new Date(finGrilla.getTime() + 24 * 60 * 60 * 1000 - BOGOTA_OFFSET_HOURS * 60 * 60 * 1000);

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, start_at, status, courts(name), profiles:player_id(full_name)")
    .in("court_id", courtIds.length ? courtIds : ["00000000-0000-0000-0000-000000000000"])
    .in("status", ["confirmed", "pending_payment", "completed"])
    .gte("start_at", rangoInicio.toISOString())
    .lt("start_at", rangoFin.toISOString())
    .order("start_at");

  const porDia = new Map<string, typeof bookings>();
  for (const b of bookings ?? []) {
    const key = bogotaDateKey(b.start_at);
    if (!porDia.has(key)) porDia.set(key, []);
    porDia.get(key)!.push(b);
  }

  const mesAnterior = new Date(Date.UTC(year, month - 1, 1));
  const mesSiguiente = new Date(Date.UTC(year, month + 1, 1));
  const fmtMes = (d: Date) =>
    `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  return (
    <DashboardShell title="Panel del dueño" links={LINKS} activeHref="/panel/calendario">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">
          {MESES[month]} {year}
        </h1>
        <div className="flex gap-2">
          <Link href={`/panel/calendario?mes=${fmtMes(mesAnterior)}`} className="btn-secondary !px-3 !py-2 text-sm">
            ← Anterior
          </Link>
          <Link href={`/panel/calendario?mes=${fmtMes(hoy)}`} className="btn-secondary !px-3 !py-2 text-sm">
            Hoy
          </Link>
          <Link href={`/panel/calendario?mes=${fmtMes(mesSiguiente)}`} className="btn-secondary !px-3 !py-2 text-sm">
            Siguiente →
          </Link>
        </div>
      </div>

      <div className="card mt-5 overflow-hidden p-0">
        <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50 text-center text-xs font-semibold uppercase tracking-wide text-ink-400">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="py-2.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {dias.map((d) => {
            const key = d.toISOString().slice(0, 10);
            const enEsteMes = d.getUTCMonth() === month;
            const esHoy = key === new Date().toISOString().slice(0, 10);
            const reservasDelDia = porDia.get(key) ?? [];

            return (
              <div
                key={key}
                className={`min-h-[110px] border-b border-r border-ink-100 p-1.5 last:border-r-0 ${
                  enEsteMes ? "bg-white" : "bg-ink-50/50"
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    esHoy
                      ? "bg-brand-600 text-white"
                      : enEsteMes
                        ? "text-ink-700"
                        : "text-ink-300"
                  }`}
                >
                  {d.getUTCDate()}
                </span>
                <div className="mt-1 space-y-1">
                  {reservasDelDia.slice(0, 3).map((r) => (
                    <div
                      key={r.id}
                      title={`${(r.courts as unknown as { name: string })?.name} — ${
                        (r.profiles as unknown as { full_name: string })?.full_name ?? ""
                      }`}
                      className={`truncate rounded border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[r.status] ?? "bg-ink-100 text-ink-600"}`}
                    >
                      {bogotaTime(r.start_at)} · {(r.courts as unknown as { name: string })?.name}
                    </div>
                  ))}
                  {reservasDelDia.length > 3 && (
                    <p className="px-1 text-[10px] text-ink-400">+{reservasDelDia.length - 3} más</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Confirmada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Esperando pago
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-400" /> Jugada
        </span>
      </div>
    </DashboardShell>
  );
}
