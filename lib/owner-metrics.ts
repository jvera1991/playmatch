// Cálculos del panel del dueño (KPIs gerenciales + CRM). Funciones puras:
// reciben filas ya leídas de Supabase (con RLS, así que solo son datos del
// dueño) y devuelven números. Sin I/O, para poder probarlas aisladas.
//
// Zona horaria: Colombia es UTC-5 fijo (sin horario de verano), mismo
// criterio que lib/availability.ts y el calendario.

export const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type BookingRow = {
  id: string;
  court_id: string;
  player_id: string;
  customer_id: string | null;
  source: "online" | "manual";
  status: "pending_payment" | "confirmed" | "cancelled" | "completed";
  start_at: string;
  end_at: string;
  created_at: string;
  total_price: number;
  owner_payout_amount: number;
  cancelled_by: string | null;
  cancellation_reason: string | null;
};

export type ScheduleRow = { court_id: string; day_of_week: number; open_time: string; close_time: string };
export type ClosureRow = { court_id: string; start_at: string; end_at: string };
export type CourtRow = { id: string; name: string };

export type PeriodKey = "7" | "30" | "90" | "mes";
export type Period = { key: PeriodKey; start: Date; end: Date; prevStart: Date; prevEnd: Date; label: string };

export function parsePeriod(raw: string | undefined, now = new Date()): Period {
  const key: PeriodKey = raw === "7" || raw === "90" || raw === "mes" ? raw : "30";
  const end = now;
  let start: Date;
  if (key === "mes") {
    // Primer día del mes en hora de Bogotá (00:00 local = 05:00 UTC).
    const local = new Date(now.getTime() + BOGOTA_OFFSET_MS);
    start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - BOGOTA_OFFSET_MS);
  } else {
    start = new Date(now.getTime() - Number(key) * DAY_MS);
  }
  const len = end.getTime() - start.getTime();
  const label = key === "mes" ? "este mes" : `últimos ${key} días`;
  return { key, start, end, prevStart: new Date(start.getTime() - len), prevEnd: start, label };
}

const isPlayed = (b: BookingRow, now: Date) =>
  (b.status === "confirmed" || b.status === "completed") && new Date(b.start_at) <= now;
const inRange = (iso: string, a: Date, b: Date) => {
  const t = new Date(iso).getTime();
  return t >= a.getTime() && t < b.getTime();
};
const minutes = (b: { start_at: string; end_at: string }) =>
  (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60000;
const clockMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const openMin = (t: string) => clockMin(t);
const closeMin = (t: string) => clockMin(t) || 1440; // cierre "00:00" = medianoche

// Llave del cliente: reserva manual -> cliente del CRM; en línea -> jugador.
export const customerKey = (b: Pick<BookingRow, "source" | "customer_id" | "player_id">) =>
  b.source === "manual" && b.customer_id ? `c-${b.customer_id}` : `p-${b.player_id}`;

// ---------- Horas abiertas (para ocupación) ----------
// Minutos abiertos por (fecha local, cancha), restando cierres puntuales.
function openWindows(
  courts: CourtRow[],
  schedules: ScheduleRow[],
  closures: ClosureRow[],
  start: Date,
  end: Date
) {
  const windows: { court_id: string; start: number; end: number; dow: number }[] = [];
  const firstLocal = new Date(start.getTime() + BOGOTA_OFFSET_MS);
  let day = Date.UTC(firstLocal.getUTCFullYear(), firstLocal.getUTCMonth(), firstLocal.getUTCDate());
  const endMs = end.getTime();
  for (; day - BOGOTA_OFFSET_MS < endMs; day += DAY_MS) {
    const dow = new Date(day).getUTCDay();
    for (const c of courts) {
      for (const s of schedules) {
        if (s.court_id !== c.id || s.day_of_week !== dow) continue;
        const ws = day - BOGOTA_OFFSET_MS + openMin(s.open_time) * 60000;
        const we = day - BOGOTA_OFFSET_MS + closeMin(s.close_time) * 60000;
        const a = Math.max(ws, start.getTime());
        const b = Math.min(we, endMs);
        if (b > a) windows.push({ court_id: c.id, start: a, end: b, dow });
      }
    }
  }
  // Restar cierres
  const result: typeof windows = [];
  for (const w of windows) {
    let pieces = [{ start: w.start, end: w.end }];
    for (const cl of closures) {
      if (cl.court_id !== w.court_id) continue;
      const cs = new Date(cl.start_at).getTime();
      const ce = new Date(cl.end_at).getTime();
      pieces = pieces.flatMap((p) => {
        if (ce <= p.start || cs >= p.end) return [p];
        const out = [];
        if (cs > p.start) out.push({ start: p.start, end: cs });
        if (ce < p.end) out.push({ start: ce, end: p.end });
        return out;
      });
    }
    for (const p of pieces) result.push({ ...w, start: p.start, end: p.end });
  }
  return result;
}

const sumMinutes = (ws: { start: number; end: number }[]) =>
  ws.reduce((s, w) => s + (w.end - w.start) / 60000, 0);

// ---------- KPIs ----------
export type Kpis = {
  netIncome: number;
  occupancy: number | null; // 0..1, null si no hay horas abiertas
  bookedHours: number;
  openHours: number;
  confirmed: number;
  manualCount: number;
  avgTicket: number | null;
  cancellationRate: number | null; // 0..1
  cancelled: number;
  topCancelReason: string | null;
  unpaid: number; // apartaron y no pagaron (cancelación del sistema)
  customers: number;
  recurringRate: number | null; // 0..1
  recurring: number;
};

export function computeKpis(
  bookings: BookingRow[],
  courts: CourtRow[],
  schedules: ScheduleRow[],
  closures: ClosureRow[],
  start: Date,
  end: Date,
  now = new Date()
): Kpis {
  const inP = bookings.filter((b) => inRange(b.start_at, start, end));
  const played = inP.filter((b) => isPlayed(b, now));
  const netIncome = played.reduce((s, b) => s + Number(b.owner_payout_amount), 0);
  const gross = played.reduce((s, b) => s + Number(b.total_price), 0);
  const bookedMin = played.reduce((s, b) => s + minutes(b), 0);
  const openMin = sumMinutes(openWindows(courts, schedules, closures, start, end));

  const byPerson = inP.filter((b) => b.status === "cancelled" && b.cancelled_by);
  const unpaid = inP.filter((b) => b.status === "cancelled" && !b.cancelled_by).length;
  const denom = played.length + byPerson.length;

  const reasons = new Map<string, number>();
  for (const b of byPerson) {
    const r = (b.cancellation_reason ?? "").trim().toLowerCase();
    if (r) reasons.set(r, (reasons.get(r) ?? 0) + 1);
  }
  const topCancelReason = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Recurrentes: clientes del periodo con 2+ reservas jugadas en total (histórico)
  const keysInP = new Set(played.map(customerKey));
  const totalPlayedByKey = new Map<string, number>();
  for (const b of bookings) {
    if (!isPlayed(b, now)) continue;
    const k = customerKey(b);
    totalPlayedByKey.set(k, (totalPlayedByKey.get(k) ?? 0) + 1);
  }
  const recurring = [...keysInP].filter((k) => (totalPlayedByKey.get(k) ?? 0) >= 2).length;

  return {
    netIncome,
    occupancy: openMin > 0 ? Math.min(1, bookedMin / openMin) : null,
    bookedHours: Math.round(bookedMin / 60),
    openHours: Math.round(openMin / 60),
    confirmed: played.length,
    manualCount: played.filter((b) => b.source === "manual").length,
    avgTicket: played.length ? Math.round(gross / played.length) : null,
    cancellationRate: denom ? byPerson.length / denom : null,
    cancelled: byPerson.length,
    topCancelReason,
    unpaid,
    customers: keysInP.size,
    recurringRate: keysInP.size ? recurring / keysInP.size : null,
    recurring,
  };
}

// Ingreso ya agendado: reservas confirmadas que aún no se juegan (30 días).
export function scheduledIncome(bookings: BookingRow[], now = new Date()) {
  const limit = now.getTime() + 30 * DAY_MS;
  const rows = bookings.filter(
    (b) => b.status === "confirmed" && new Date(b.start_at) > now && new Date(b.start_at).getTime() <= limit
  );
  return { amount: rows.reduce((s, b) => s + Number(b.owner_payout_amount), 0), count: rows.length };
}

// ---------- Ingresos por semana (lunes a domingo, hora Bogotá) ----------
export function weeklyIncome(bookings: BookingRow[], weeks = 8, now = new Date()) {
  const local = new Date(now.getTime() + BOGOTA_OFFSET_MS);
  const todayLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const mondayLocal = todayLocal - ((new Date(todayLocal).getUTCDay() + 6) % 7) * DAY_MS;
  const out: { label: string; start: Date; amount: number; count: number }[] = [];
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  for (let i = weeks - 1; i >= 0; i--) {
    const wsLocal = mondayLocal - i * 7 * DAY_MS;
    const ws = new Date(wsLocal - BOGOTA_OFFSET_MS);
    const we = new Date(wsLocal + 7 * DAY_MS - BOGOTA_OFFSET_MS);
    const rows = bookings.filter((b) => isPlayed(b, now) && inRange(b.start_at, ws, we));
    const d = new Date(wsLocal);
    out.push({
      label: `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`,
      start: ws,
      amount: rows.reduce((s, b) => s + Number(b.owner_payout_amount), 0),
      count: rows.length,
    });
  }
  return out;
}

// ---------- Mapa de calor: ocupación por día de semana y hora ----------
export type HeatCell = { dow: number; hour: number; booked: number; open: number };
export function occupancyHeatmap(
  bookings: BookingRow[],
  courts: CourtRow[],
  schedules: ScheduleRow[],
  closures: ClosureRow[],
  start: Date,
  end: Date,
  now = new Date()
) {
  const cells = new Map<string, HeatCell>();
  const add = (dow: number, hour: number, field: "booked" | "open", mins: number) => {
    const k = `${dow}-${hour}`;
    const c = cells.get(k) ?? { dow, hour, booked: 0, open: 0 };
    c[field] += mins;
    cells.set(k, c);
  };
  // Reparte un intervalo [a,b) en bloques de hora local
  const spread = (a: number, b: number, field: "booked" | "open") => {
    let t = a;
    while (t < b) {
      const local = new Date(t + BOGOTA_OFFSET_MS);
      const hourEnd = t + (60 - local.getUTCMinutes()) * 60000 - local.getUTCSeconds() * 1000;
      const seg = Math.min(b, hourEnd) - t;
      add(local.getUTCDay(), local.getUTCHours(), field, seg / 60000);
      t += seg;
    }
  };
  for (const w of openWindows(courts, schedules, closures, start, end)) spread(w.start, w.end, "open");
  for (const b of bookings) {
    if (!isPlayed(b, now) || !inRange(b.start_at, start, end)) continue;
    spread(new Date(b.start_at).getTime(), new Date(b.end_at).getTime(), "booked");
  }
  const hours = [...cells.values()].filter((c) => c.open > 0).map((c) => c.hour);
  const minHour = hours.length ? Math.min(...hours) : 6;
  const maxHour = hours.length ? Math.max(...hours) : 22;
  return { cells, minHour, maxHour };
}

// ---------- Por cancha ----------
export function perCourt(
  bookings: BookingRow[],
  courts: CourtRow[],
  schedules: ScheduleRow[],
  closures: ClosureRow[],
  start: Date,
  end: Date,
  now = new Date()
) {
  return courts.map((c) => {
    const k = computeKpis(
      bookings.filter((b) => b.court_id === c.id),
      [c],
      schedules.filter((s) => s.court_id === c.id),
      closures.filter((x) => x.court_id === c.id),
      start,
      end,
      now
    );
    return { id: c.id, name: c.name, income: k.netIncome, occupancy: k.occupancy };
  });
}

// ---------- Clientes (CRM) ----------
export type Segment = "frecuente" | "nuevo" | "en_riesgo" | "inactivo" | "ocasional";
export const SEGMENT_LABEL: Record<Segment, string> = {
  frecuente: "Frecuente",
  nuevo: "Nuevo",
  en_riesgo: "En riesgo",
  inactivo: "Inactivo",
  ocasional: "Ocasional",
};

export type CustomerSummary = {
  key: string;
  played: number;
  cancelled: number;
  totalPaid: number;
  firstAt: string | null;
  lastPlayedAt: string | null;
  nextAt: string | null;
  segment: Segment;
};

export function summarizeCustomers(bookings: BookingRow[], now = new Date()) {
  const map = new Map<string, CustomerSummary>();
  for (const b of bookings) {
    const key = customerKey(b);
    const s =
      map.get(key) ??
      ({ key, played: 0, cancelled: 0, totalPaid: 0, firstAt: null, lastPlayedAt: null, nextAt: null, segment: "ocasional" } as CustomerSummary);
    if (b.status === "cancelled") {
      if (b.cancelled_by) s.cancelled += 1;
    } else if (b.status !== "pending_payment") {
      if (!s.firstAt || b.start_at < s.firstAt) s.firstAt = b.start_at;
      if (new Date(b.start_at) <= now) {
        s.played += 1;
        s.totalPaid += Number(b.total_price);
        if (!s.lastPlayedAt || b.start_at > s.lastPlayedAt) s.lastPlayedAt = b.start_at;
      } else if (!s.nextAt || b.start_at < s.nextAt) {
        s.nextAt = b.start_at;
      }
    }
    map.set(key, s);
  }
  const t = now.getTime();
  const daysSince = (iso: string | null) => (iso ? (t - new Date(iso).getTime()) / DAY_MS : Infinity);
  for (const s of map.values()) {
    const recent60 = bookings.filter(
      (b) => customerKey(b) === s.key && isPlayed(b, now) && daysSince(b.start_at) <= 60
    ).length;
    const last = daysSince(s.lastPlayedAt);
    if (recent60 >= 3) s.segment = "frecuente";
    else if (daysSince(s.firstAt) <= 30) s.segment = "nuevo";
    else if (s.played >= 3 && last > 30 && !s.nextAt) s.segment = "en_riesgo";
    else if (last > 60 && !s.nextAt) s.segment = "inactivo";
    else s.segment = "ocasional";
  }
  return map;
}

// ---------- Alertas "Para actuar hoy" ----------
export type Alert = { tone: "warn" | "info" | "good"; title: string; detail: string; href?: string; cta?: string };

const fmtHour = (h: number) => {
  const p = h >= 12 ? "p.m." : "a.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${p}`;
};
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function buildAlerts(args: {
  bookings: BookingRow[];
  courts: CourtRow[];
  schedules: ScheduleRow[];
  heat: ReturnType<typeof occupancyHeatmap>;
  customers: Map<string, CustomerSummary>;
  now?: Date;
}): Alert[] {
  const { bookings, courts, schedules, heat, customers } = args;
  const now = args.now ?? new Date();
  const alerts: Alert[] = [];

  // 1) Reservas que esperan pago (el cupo se libera a los 15 min)
  const waiting = bookings.filter(
    (b) => b.status === "pending_payment" && now.getTime() - new Date(b.created_at).getTime() < 15 * 60000
  ).length;
  if (waiting) {
    alerts.push({
      tone: "info",
      title: `${waiting} ${waiting === 1 ? "reserva espera" : "reservas esperan"} pago`,
      detail: "Si no pagan en 15 minutos, el cupo se libera solo.",
      href: "/panel/reservas",
      cta: "Ver",
    });
  }

  // 2) Horas pico libres mañana
  const byHour = new Map<number, { booked: number; open: number }>();
  for (const c of heat.cells.values()) {
    const v = byHour.get(c.hour) ?? { booked: 0, open: 0 };
    v.booked += c.booked;
    v.open += c.open;
    byHour.set(c.hour, v);
  }
  const peakHours = [...byHour.entries()]
    .filter(([, v]) => v.open > 0 && v.booked > 0)
    .sort((a, b) => b[1].booked / b[1].open - a[1].booked / a[1].open)
    .slice(0, 3)
    .map(([h]) => h);
  if (peakHours.length) {
    const local = new Date(now.getTime() + BOGOTA_OFFSET_MS);
    const tomorrowLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + DAY_MS;
    const dow = new Date(tomorrowLocal).getUTCDay();
    let free = 0;
    for (const c of courts) {
      for (const h of peakHours) {
        const open = schedules.some(
          (s) => s.court_id === c.id && s.day_of_week === dow && openMin(s.open_time) <= h * 60 && closeMin(s.close_time) >= (h + 1) * 60
        );
        if (!open) continue;
        const slotStart = tomorrowLocal - BOGOTA_OFFSET_MS + h * 3600000;
        const taken = bookings.some(
          (b) =>
            b.court_id === c.id &&
            b.status !== "cancelled" &&
            new Date(b.start_at).getTime() < slotStart + 3600000 &&
            new Date(b.end_at).getTime() > slotStart
        );
        if (!taken) free += 1;
      }
    }
    if (free) {
      const sorted = [...peakHours].sort((a, b) => a - b);
      alerts.push({
        tone: "warn",
        title: `Mañana hay ${free} ${free === 1 ? "hora pico libre" : "horas pico libres"}`,
        detail: `Avísale a tus clientes frecuentes. Tus horas más vendidas son ${sorted.map(fmtHour).join(", ")}`,
        href: "/panel/clientes?segmento=frecuente",
        cta: "Ver clientes",
      });
    }
  }

  // 3) Clientes en riesgo
  const atRisk = [...customers.values()].filter((c) => c.segment === "en_riesgo").length;
  if (atRisk) {
    alerts.push({
      tone: "warn",
      title: `${atRisk} ${atRisk === 1 ? "cliente frecuente no vuelve" : "clientes frecuentes no vuelven"} hace más de 30 días`,
      detail: "Un mensaje a tiempo suele recuperarlos.",
      href: "/panel/clientes?segmento=en_riesgo",
      cta: "Escribirles",
    });
  }

  // 4) Mejor y peor día de la semana
  const byDow = new Map<number, { booked: number; open: number }>();
  for (const c of heat.cells.values()) {
    const v = byDow.get(c.dow) ?? { booked: 0, open: 0 };
    v.booked += c.booked;
    v.open += c.open;
    byDow.set(c.dow, v);
  }
  const ranked = [...byDow.entries()].filter(([, v]) => v.open > 0).map(([d, v]) => ({ d, occ: v.booked / v.open }));
  if (ranked.length >= 2 && ranked.some((r) => r.occ > 0)) {
    ranked.sort((a, b) => b.occ - a.occ);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    alerts.push({
      tone: "good",
      title: `Tu mejor día: ${DIAS[best.d]} (${Math.round(best.occ * 100)}% de ocupación)`,
      detail: `El más flojo es ${DIAS[worst.d]} (${Math.round(worst.occ * 100)}%). Considera un precio especial ese día.`,
    });
  }

  return alerts;
}

// Variación entre periodos, para las etiquetas ▲ ▼
export function delta(current: number | null, previous: number | null, mode: "pct" | "pts" | "abs") {
  if (current == null || previous == null) return null;
  if (mode === "pts") return Math.round((current - previous) * 100);
  if (mode === "abs") return current - previous;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}
