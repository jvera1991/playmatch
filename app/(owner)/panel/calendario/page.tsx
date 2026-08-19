import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireOwner } from "@/lib/guards";
import { OWNER_LINKS as LINKS } from "@/lib/owner-links";
import { CalendarEventChip, type CalendarEvent } from "@/components/calendar-event-chip";

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_SEMANA_LARGO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

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

// Fecha larga en español ("Miércoles 19 de agosto de 2026"), calculada a mano
// (sin Intl/toLocaleString) para que el texto sea idéntico entre el servidor
// y el navegador — el mismo problema de "hydration mismatch" que ya tuvimos
// con las horas de los slots (ver components/slot-picker.tsx).
function bogotaFechaLarga(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + BOGOTA_OFFSET_HOURS * 60 * 60 * 1000);
  const dia = DIAS_SEMANA_LARGO[shifted.getUTCDay()];
  const numero = shifted.getUTCDate();
  const mes = MESES[shifted.getUTCMonth()].toLowerCase();
  const anio = shifted.getUTCFullYear();
  return `${dia} ${numero} de ${mes} de ${anio}`;
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
    .select(
      "id, start_at, end_at, status, total_price, courts(name, venues(name, address)), profiles:player_id(full_name, whatsapp_number, phone)"
    )
    .in("court_id", courtIds.length ? courtIds : ["00000000-0000-0000-0000-000000000000"])
    .in("status", ["confirmed", "pending_payment", "completed"])
    .gte("start_at", rangoInicio.toISOString())
    .lt("start_at", rangoFin.toISOString())
    .order("start_at");

  // Franjas bloqueadas por el dueño (mantenimiento, vacaciones, torneos
  // privados) — se muestran en el calendario igual que un bloqueo de
  // vacaciones en Google Calendar, para que el dueño vea de un vistazo qué
  // días/horas no están disponibles para reservar.
  const { data: closures } = await supabase
    .from("court_closures")
    .select("id, start_at, end_at, reason, courts(name, venues(name, address))")
    .in("court_id", courtIds.length ? courtIds : ["00000000-0000-0000-0000-000000000000"])
    .lt("start_at", rangoFin.toISOString())
    .gt("end_at", rangoInicio.toISOString());

  type EventoDia = (CalendarEvent & { hora: string; tipo: "reserva" | "bloqueo" });

  const porDia = new Map<string, EventoDia[]>();

  for (const b of bookings ?? []) {
    const key = bogotaDateKey(b.start_at);
    const court = b.courts as unknown as {
      name: string;
      venues: { name: string; address: string } | null;
    };
    const player = b.profiles as unknown as {
      full_name: string | null;
      whatsapp_number: string | null;
      phone: string | null;
    };
    if (!porDia.has(key)) porDia.set(key, []);
    porDia.get(key)!.push({
      tipo: "reserva",
      id: b.id,
      hora: bogotaTime(b.start_at),
      status: b.status as "confirmed" | "pending_payment" | "completed",
      courtName: court?.name ?? "",
      venueName: court?.venues?.name ?? null,
      venueAddress: court?.venues?.address ?? null,
      playerName: player?.full_name ?? null,
      playerPhone: player?.whatsapp_number ?? player?.phone ?? null,
      horaInicio: bogotaTime(b.start_at),
      horaFin: bogotaTime(b.end_at),
      fechaLarga: bogotaFechaLarga(b.start_at),
      totalPrice: Number(b.total_price),
    });
  }

  for (const c of closures ?? []) {
    // Expandimos cada bloqueo a un chip por cada día del mes que cubra
    // (una franja puede durar varios días, ej. vacaciones de una semana).
    const inicioBloqueo = bogotaDateKey(c.start_at);
    const finBloqueo = bogotaDateKey(c.end_at);
    const court = c.courts as unknown as {
      name: string;
      venues: { name: string; address: string } | null;
    };
    let cursor = inicioBloqueo;
    let guard = 0;
    while (cursor <= finBloqueo && guard < 60) {
      guard++;
      if (!porDia.has(cursor)) porDia.set(cursor, []);
      porDia.get(cursor)!.push({
        tipo: "bloqueo",
        id: `${c.id}-${cursor}`,
        hora: cursor === inicioBloqueo ? bogotaTime(c.start_at) : "12:00am",
        courtName: court?.name ?? "",
        venueName: court?.venues?.name ?? null,
        venueAddress: court?.venues?.address ?? null,
        reason: c.reason ?? null,
        horaInicio: cursor === inicioBloqueo ? bogotaTime(c.start_at) : "12:00am",
        horaFin: cursor === finBloqueo ? bogotaTime(c.end_at) : "11:59pm",
        fechaInicioLarga: bogotaFechaLarga(c.start_at),
        fechaFinLarga: bogotaFechaLarga(c.end_at),
        cubreVariosDias: inicioBloqueo !== finBloqueo,
      });
      const next = new Date(cursor + "T12:00:00Z");
      next.setUTCDate(next.getUTCDate() + 1);
      cursor = next.toISOString().slice(0, 10);
    }
  }

  // Dentro de cada día, bloqueos primero (más importantes de notar) y luego
  // reservas ordenadas por hora.
  for (const eventos of porDia.values()) {
    eventos.sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === "bloqueo" ? -1 : 1;
      return a.hora.localeCompare(b.hora);
    });
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

      <div className="card mt-5 overflow-x-auto p-0">
        <div className="min-w-[640px]">
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
            const eventosDelDia = porDia.get(key) ?? [];

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
                  {eventosDelDia.slice(0, 3).map((ev) => (
                    <CalendarEventChip key={ev.id} event={ev} />
                  ))}
                  {eventosDelDia.length > 3 && (
                    <p className="px-1 text-[10px] text-ink-400">+{eventosDelDia.length - 3} más</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-300" /> 🔒 Bloqueado por ti
        </span>
      </div>
    </DashboardShell>
  );
}
