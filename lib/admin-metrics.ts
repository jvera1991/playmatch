import {
  BOGOTA_OFFSET_MS,
  computeKpis,
  occupancyHeatmap,
  summarizeCustomers,
  type Alert,
  type BookingRow,
  type CustomerSummary,
  type HeatCell,
  type Period,
  type Segment,
} from "@/lib/owner-metrics";
import type { AdminBooking, AdminData } from "@/lib/admin-data";

// KPIs y CRM del panel admin (06/10/2026). Funciones puras sobre los datos de
// toda la plataforma. Reglas de dinero: solo cuenta lo reservado EN LÍNEA
// (source = 'online'); las reservas manuales de los dueños no pagan comisión.
// Para ocupación y mapa de calor sí cuentan todas (también ocupan la cancha).

const DAY_MS = 86_400_000;
const isPlayed = (b: { status: string; start_at: string }, now: Date) =>
  (b.status === "confirmed" || b.status === "completed") && new Date(b.start_at) <= now;
const inRange = (iso: string, a: Date, b: Date) => {
  const t = new Date(iso).getTime();
  return t >= a.getTime() && t < b.getTime();
};
const norm = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");
const zoneKey = (s: string | null | undefined) => norm(s).toLowerCase();
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

export const SPORT_LABEL: Record<string, string> = { futbol: "Fútbol", padel: "Pádel", voley: "Vóley" };

// ---------- Índices de apoyo ----------
function indexes(data: AdminData) {
  const venueById = new Map(data.venues.map((v) => [v.id, v]));
  const courtById = new Map(data.courts.map((c) => [c.id, c]));
  const ownerOfCourt = (courtId: string) => venueById.get(courtById.get(courtId)?.venue_id ?? "")?.owner_id ?? null;
  const zoneOfCourt = (courtId: string) => venueById.get(courtById.get(courtId)?.venue_id ?? "")?.neighborhood ?? null;
  return { venueById, courtById, ownerOfCourt, zoneOfCourt };
}

// Canchas que cuentan para ocupación: activas, aprobadas y de sede activa
function liveCourts(data: AdminData) {
  const { venueById } = indexes(data);
  return data.courts.filter((c) => c.is_active && c.is_approved && venueById.get(c.venue_id)?.is_active !== false);
}

// ---------- KPIs de la plataforma ----------
export type AdminKpis = {
  commission: number;
  gmv: number;
  confirmed: number;
  occupancy: number | null;
  avgTicket: number | null;
  failRate: number | null; // reservas que expiraron sin pago / (jugadas + expiradas)
  activePlayers: number;
  newPlayers: number;
  recurringRate: number | null;
  activeOwners: number;
  totalOwners: number;
  idleCourts: number;
  toPay: number;
};

export function computeAdminKpis(data: AdminData, start: Date, end: Date, now = new Date()): AdminKpis {
  const online = data.bookings.filter((b) => b.source === "online");
  const played = online.filter((b) => isPlayed(b, now) && inRange(b.start_at, start, end));
  const courts = liveCourts(data);

  const net = computeKpis(online as BookingRow[], courts, data.schedules, data.closures, start, end, now);
  const occ = computeKpis(data.bookings as BookingRow[], courts, data.schedules, data.closures, start, end, now);

  const playersInP = new Set(played.map((b) => b.player_id));
  const playedByPlayer = new Map<string, number>();
  const firstByPlayer = new Map<string, string>();
  for (const b of online) {
    if (!isPlayed(b, now)) continue;
    playedByPlayer.set(b.player_id, (playedByPlayer.get(b.player_id) ?? 0) + 1);
    const f = firstByPlayer.get(b.player_id);
    if (!f || b.start_at < f) firstByPlayer.set(b.player_id, b.start_at);
  }
  const newPlayers = [...playersInP].filter((id) => {
    const f = firstByPlayer.get(id);
    return f ? inRange(f, start, end) : false;
  }).length;
  const recurring = [...playersInP].filter((id) => (playedByPlayer.get(id) ?? 0) >= 2).length;

  const { ownerOfCourt } = indexes(data);
  const ownersInP = new Set(played.map((b) => ownerOfCourt(b.court_id)).filter(Boolean));
  const totalOwners = data.profiles.filter((p) => p.role === "owner" && p.is_approved_owner).length;

  // Canchas "dormidas": activas y aprobadas con más de 30 días de vida y sin
  // ninguna reserva jugada en los últimos 30 días
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const withBookings = new Set(
    online.filter((b) => isPlayed(b, now) && new Date(b.start_at) >= since30).map((b) => b.court_id)
  );
  const idleCourts = courts.filter((c) => new Date(c.created_at) < since30 && !withBookings.has(c.id)).length;

  return {
    commission: played.reduce((s, b) => s + b.commission_amount, 0),
    gmv: played.reduce((s, b) => s + b.total_price, 0),
    confirmed: played.length,
    occupancy: occ.occupancy,
    avgTicket: net.avgTicket,
    failRate: net.confirmed + net.unpaid ? net.unpaid / (net.confirmed + net.unpaid) : null,
    activePlayers: playersInP.size,
    newPlayers,
    recurringRate: playersInP.size ? recurring / playersInP.size : null,
    activeOwners: ownersInP.size,
    totalOwners,
    idleCourts,
    toPay: amountToPay(data, now),
  };
}

// Lo jugado (en línea) que se le debe a los dueños menos lo ya pagado (payouts "paid").
// Es una estimación: no hay vínculo reserva↔pago (ver CLAUDE.md, pendiente 5).
export function amountToPay(data: AdminData, now = new Date()) {
  const owed = data.bookings
    .filter((b) => b.source === "online" && isPlayed(b, now))
    .reduce((s, b) => s + b.owner_payout_amount, 0);
  const paid = data.paidPayouts.reduce((s, p) => s + p.amount, 0);
  return Math.max(0, owed - paid);
}

// ---------- Comisión por semana (lunes a domingo, hora Bogotá) ----------
export function weeklyCommission(bookings: AdminBooking[], weeks = 8, now = new Date()) {
  const local = new Date(now.getTime() + BOGOTA_OFFSET_MS);
  const todayLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const mondayLocal = todayLocal - ((new Date(todayLocal).getUTCDay() + 6) % 7) * DAY_MS;
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const online = bookings.filter((b) => b.source === "online" && isPlayed(b, now));
  const out: { label: string; amount: number; count: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const wsLocal = mondayLocal - i * 7 * DAY_MS;
    const ws = new Date(wsLocal - BOGOTA_OFFSET_MS);
    const we = new Date(wsLocal + 7 * DAY_MS - BOGOTA_OFFSET_MS);
    const rows = online.filter((b) => inRange(b.start_at, ws, we));
    const d = new Date(wsLocal);
    out.push({
      label: `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`,
      amount: rows.reduce((s, b) => s + b.commission_amount, 0),
      count: rows.length,
    });
  }
  return out;
}

// ---------- Mapa de calor de toda la red ----------
export function networkHeatmap(data: AdminData, start: Date, end: Date, now = new Date()) {
  return occupancyHeatmap(data.bookings as BookingRow[], liveCourts(data), data.schedules, data.closures, start, end, now);
}

// Hora (local) con más horas jugadas en la red: la "hora pico"
export function peakHour(cells: Map<string, HeatCell>) {
  const byHour = new Map<number, number>();
  for (const c of cells.values()) byHour.set(c.hour, (byHour.get(c.hour) ?? 0) + c.booked);
  return [...byHour.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// ---------- Reparto por deporte y por zona ----------
export function shareBy(data: AdminData, start: Date, end: Date, now = new Date()) {
  const { courtById, zoneOfCourt } = indexes(data);
  const played = data.bookings.filter((b) => b.source === "online" && isPlayed(b, now) && inRange(b.start_at, start, end));
  const sports = new Map<string, number>();
  const zones = new Map<string, { label: string; n: number }>();
  for (const b of played) {
    const sport = courtById.get(b.court_id)?.sport;
    if (sport) sports.set(sport, (sports.get(sport) ?? 0) + 1);
    const z = norm(zoneOfCourt(b.court_id)) || "Sin zona";
    const k = zoneKey(z);
    const cur = zones.get(k) ?? { label: titleCase(z), n: 0 };
    cur.n += 1;
    zones.set(k, cur);
  }
  const total = played.length;
  const toList = (entries: [string, number][]) =>
    entries.sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, n, pct: total ? n / total : 0 }));
  return {
    total,
    sports: toList([...sports.entries()].map(([k, n]) => [SPORT_LABEL[k] ?? k, n] as [string, number])),
    zones: toList([...zones.values()].map((z) => [z.label, z.n] as [string, number])),
  };
}

// ---------- Jugadores (CRM) ----------
export type PlayerSegment = Segment | "sin_reservar";
export const PLAYER_SEGMENT_LABEL: Record<PlayerSegment, string> = {
  frecuente: "Frecuente",
  nuevo: "Nuevo",
  en_riesgo: "En riesgo",
  inactivo: "Inactivo",
  ocasional: "Ocasional",
  sin_reservar: "Sin reservar",
};

export type PlayerRow = {
  id: string;
  name: string;
  phone: string | null;
  createdAt: string;
  segment: PlayerSegment;
  played: number;
  cancelled: number;
  totalPaid: number;
  lastPlayedAt: string | null;
  nextAt: string | null;
  sport: string | null;
  zone: string | null;
  courtsPlayed: { name: string; n: number }[];
};

export function buildPlayers(data: AdminData, now = new Date()): PlayerRow[] {
  const online = data.bookings.filter((b) => b.source === "online");
  const summaries = summarizeCustomers(online as BookingRow[], now);
  const { courtById, zoneOfCourt } = indexes(data);

  const prefs = new Map<string, { sport: Map<string, number>; zone: Map<string, { l: string; n: number }>; courts: Map<string, number> }>();
  for (const b of online) {
    if (!isPlayed(b, now)) continue;
    const p = prefs.get(b.player_id) ?? { sport: new Map(), zone: new Map(), courts: new Map() };
    const court = courtById.get(b.court_id);
    if (court) {
      p.sport.set(court.sport, (p.sport.get(court.sport) ?? 0) + 1);
      p.courts.set(court.name, (p.courts.get(court.name) ?? 0) + 1);
    }
    const z = norm(zoneOfCourt(b.court_id));
    if (z) {
      const cur = p.zone.get(zoneKey(z)) ?? { l: titleCase(z), n: 0 };
      cur.n += 1;
      p.zone.set(zoneKey(z), cur);
    }
    prefs.set(b.player_id, p);
  }
  const top = <T,>(m: Map<string, T>, score: (v: T) => number) =>
    [...m.entries()].sort((a, b) => score(b[1]) - score(a[1]))[0];

  return data.profiles
    .filter((p) => p.role === "player")
    .map((p) => {
      const s: CustomerSummary | undefined = summaries.get(`p-${p.id}`);
      const pr = prefs.get(p.id);
      const sportTop = pr ? top(pr.sport, (n) => n)?.[0] : undefined;
      const zoneTop = pr ? top(pr.zone, (z) => z.n)?.[1].l : undefined;
      const hasActivity = !!s && (s.played > 0 || !!s.nextAt);
      return {
        id: p.id,
        name: p.full_name || "Sin nombre",
        phone: p.whatsapp_number || p.phone,
        createdAt: p.created_at,
        segment: (hasActivity ? s!.segment : "sin_reservar") as PlayerSegment,
        played: s?.played ?? 0,
        cancelled: s?.cancelled ?? 0,
        totalPaid: s?.totalPaid ?? 0,
        lastPlayedAt: s?.lastPlayedAt ?? null,
        nextAt: s?.nextAt ?? null,
        sport: sportTop ? SPORT_LABEL[sportTop] ?? sportTop : null,
        zone: zoneTop ?? null,
        courtsPlayed: pr ? [...pr.courts.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n) : [],
      };
    })
    .sort((a, b) => (b.lastPlayedAt ?? "").localeCompare(a.lastPlayedAt ?? "") || a.name.localeCompare(b.name, "es"));
}

// ---------- Dueños y sedes (CRM con "salud") ----------
export type OwnerHealth = "nuevo" | "activo" | "en_riesgo" | "dormido";
export const OWNER_HEALTH_LABEL: Record<OwnerHealth, string> = {
  nuevo: "Nuevo",
  activo: "Activo",
  en_riesgo: "En riesgo",
  dormido: "Dormido",
};

export type OwnerRow = {
  id: string;
  name: string;
  phone: string | null;
  createdAt: string;
  health: OwnerHealth;
  venueNames: string[];
  courts: { id: string; name: string; sport: string; price: number; photos: boolean; approved: boolean; active: boolean }[];
  played30: number;
  gmv30: number;
  commission30: number;
  occupancy30: number | null;
  cancelRate30: number | null;
  lastPlayedAt: string | null;
  hints: string[];
};

export function buildOwners(data: AdminData, now = new Date()): OwnerRow[] {
  const { venueById, ownerOfCourt } = indexes(data);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since60 = new Date(now.getTime() - 60 * DAY_MS);
  const photos = new Set(data.courtsWithPhotos);
  const heat = networkHeatmap(data, since30, now, now);
  const peak = peakHour(heat.cells);

  // Precio promedio por deporte (para detectar canchas muy caras)
  const avgBySport = new Map<string, { sum: number; n: number }>();
  for (const c of data.courts) {
    const a = avgBySport.get(c.sport) ?? { sum: 0, n: 0 };
    a.sum += c.price_per_hour;
    a.n += 1;
    avgBySport.set(c.sport, a);
  }

  return data.profiles
    .filter((p) => p.role === "owner" && p.is_approved_owner)
    .map((p) => {
      const courts = data.courts.filter((c) => ownerOfCourt(c.id) === p.id);
      const ids = new Set(courts.map((c) => c.id));
      const mine = data.bookings.filter((b) => ids.has(b.court_id));
      const online = mine.filter((b) => b.source === "online");
      const played30 = online.filter((b) => isPlayed(b, now) && new Date(b.start_at) >= since30);
      const playedPrev = online.filter(
        (b) => isPlayed(b, now) && new Date(b.start_at) >= since60 && new Date(b.start_at) < since30
      );
      const live = courts.filter((c) => c.is_active && c.is_approved);
      const k = computeKpis(
        mine as BookingRow[],
        live,
        data.schedules.filter((s) => ids.has(s.court_id)),
        data.closures.filter((x) => ids.has(x.court_id)),
        since30,
        now,
        now
      );
      const k_online = computeKpis(online as BookingRow[], live, [], [], since30, now, now);
      const lastPlayed = online.filter((b) => isPlayed(b, now)).map((b) => b.start_at).sort().pop() ?? null;
      const cancelRate = k_online.cancellationRate;

      let health: OwnerHealth;
      if (new Date(p.created_at) >= since30 && played30.length === 0) health = "nuevo";
      else if (played30.length === 0) health = "dormido";
      else if ((cancelRate ?? 0) > 0.15 || (playedPrev.length >= 3 && played30.length < playedPrev.length * 0.5)) health = "en_riesgo";
      else health = "activo";

      // Pistas de por qué le va mal (solo si no está "activo")
      const hints: string[] = [];
      if (health !== "activo") {
        for (const c of live) if (!photos.has(c.id)) hints.push(`"${c.name}" no tiene fotos`);
        for (const c of live) {
          const sch = data.schedules.filter((s) => s.court_id === c.id);
          if (!sch.length) {
            hints.push(`"${c.name}" no tiene horario semanal`);
            continue;
          }
          if (peak != null) {
            const close = Math.max(
              ...sch.map((s) => {
                const [h, m] = s.close_time.split(":").map(Number);
                return (h * 60 + (m || 0) || 1440) / 60;
              })
            );
            if (close <= peak) hints.push(`"${c.name}" cierra antes de la hora pico de la red`);
          }
          const a = avgBySport.get(c.sport);
          if (a && a.n >= 3 && c.price_per_hour > (a.sum / a.n) * 1.3) hints.push(`"${c.name}" cuesta 30% más que el promedio de ${SPORT_LABEL[c.sport]}`);
        }
        if ((cancelRate ?? 0) > 0.15) hints.push("cancela muchas reservas");
        if (courts.some((c) => c.is_active && !c.is_approved)) hints.push("tiene canchas esperando tu aprobación");
      }

      return {
        id: p.id,
        name: p.full_name || "Sin nombre",
        phone: p.whatsapp_number || p.phone,
        createdAt: p.created_at,
        health,
        venueNames: data.venues.filter((v) => v.owner_id === p.id).map((v) => v.name),
        courts: courts.map((c) => ({
          id: c.id,
          name: c.name,
          sport: SPORT_LABEL[c.sport] ?? c.sport,
          price: c.price_per_hour,
          photos: photos.has(c.id),
          approved: c.is_approved,
          active: c.is_active,
        })),
        played30: played30.length,
        gmv30: played30.reduce((s, b) => s + b.total_price, 0),
        commission30: played30.reduce((s, b) => s + b.commission_amount, 0),
        occupancy30: k.occupancy,
        cancelRate30: cancelRate,
        lastPlayedAt: lastPlayed,
        hints,
      };
    })
    .sort((a, b) => b.gmv30 - a.gmv30 || a.name.localeCompare(b.name, "es"));
}

// ---------- Ranking de dueños por volumen en el periodo ----------
export function ownerRanking(data: AdminData, start: Date, end: Date, now = new Date(), limit = 5) {
  const { ownerOfCourt } = indexes(data);
  const nameOf = new Map(data.profiles.map((p) => [p.id, p.full_name]));
  const venuesOf = new Map<string, string>();
  for (const v of data.venues) if (!venuesOf.has(v.owner_id)) venuesOf.set(v.owner_id, v.name);
  const sums = new Map<string, number>();
  for (const b of data.bookings) {
    if (b.source !== "online" || !isPlayed(b, now) || !inRange(b.start_at, start, end)) continue;
    const o = ownerOfCourt(b.court_id);
    if (o) sums.set(o, (sums.get(o) ?? 0) + b.total_price);
  }
  return [...sums.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, amount]) => ({ id, name: venuesOf.get(id) || nameOf.get(id) || "—", amount }));
}

// ---------- "Para actuar hoy" ----------
export function buildAdminAlerts(args: {
  data: AdminData;
  kpis: AdminKpis;
  prev: AdminKpis;
  players: PlayerRow[];
  owners: OwnerRow[];
  shares: ReturnType<typeof shareBy>;
  now?: Date;
}): Alert[] {
  const { data, kpis, players, owners, shares } = args;
  const now = args.now ?? new Date();
  const alerts: Alert[] = [];
  const fmt = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

  const pendingOwners = data.profiles.filter((p) => p.role === "owner" && !p.is_approved_owner);
  if (pendingOwners.length) {
    const oldest = Math.max(...pendingOwners.map((p) => Math.floor((now.getTime() - new Date(p.created_at).getTime()) / DAY_MS)));
    alerts.push({
      tone: "warn",
      title: `${pendingOwners.length} dueño${pendingOwners.length > 1 ? "s esperan" : " espera"} aprobación`,
      detail: oldest > 0 ? `El más antiguo lleva ${oldest} día${oldest > 1 ? "s" : ""}.` : "Llegaron hoy.",
      href: "/admin/duenos",
      cta: "Revisar",
    });
  }

  const pendingCourts = data.courts.filter((c) => c.is_active && !c.is_approved).length;
  if (pendingCourts) {
    alerts.push({
      tone: "warn",
      title: `${pendingCourts} cancha${pendingCourts > 1 ? "s" : ""} pendiente${pendingCourts > 1 ? "s" : ""} de aprobar`,
      detail: "No salen en el buscador hasta que las apruebes.",
      href: "/admin/canchas",
      cta: "Revisar",
    });
  }

  if (kpis.toPay > 0) {
    alerts.push({
      tone: "info",
      title: `${fmt(kpis.toPay)} por liquidar a dueños`,
      detail: "Reservas ya jugadas menos los pagos que ya registraste (estimado).",
      href: "/admin/pagos",
      cta: "Pagar",
    });
  }

  if (kpis.idleCourts > 0) {
    alerts.push({
      tone: "warn",
      title: `${kpis.idleCourts} cancha${kpis.idleCourts > 1 ? "s" : ""} sin reservas en 30 días`,
      detail: "Puede ser precio, fotos u horario. Escríbele al dueño.",
      href: "/admin/duenos-y-sedes?salud=dormido",
      cta: "Ver",
    });
  }

  const risk = owners.filter((o) => o.health === "en_riesgo").length;
  if (risk) {
    alerts.push({
      tone: "warn",
      title: `${risk} dueño${risk > 1 ? "s" : ""} en riesgo`,
      detail: "Bajaron sus reservas o cancelan mucho.",
      href: "/admin/duenos-y-sedes?salud=en_riesgo",
      cta: "Ver",
    });
  }

  const atRisk = players.filter((p) => p.segment === "en_riesgo").length;
  if (atRisk) {
    alerts.push({
      tone: "info",
      title: `${atRisk} jugador${atRisk > 1 ? "es" : ""} frecuente${atRisk > 1 ? "s" : ""} sin volver`,
      detail: "Llevan más de 30 días sin reservar. Un mensaje de WhatsApp suele bastar.",
      href: "/admin/jugadores?segmento=en_riesgo",
      cta: "Ver",
    });
  }

  if (kpis.failRate != null && kpis.failRate >= 0.15) {
    alerts.push({
      tone: "warn",
      title: `${Math.round(kpis.failRate * 100)}% de las reservas no se paga`,
      detail: "Expiran a los 15 minutos. Revisa si el checkout de Wompi está fallando.",
    });
  }

  const zones = shares.zones.filter((z) => z.label !== "Sin zona");
  if (shares.total >= 5 && zones.length >= 1) {
    const best = zones[0];
    alerts.push({
      tone: "good",
      title: `Mejor zona: ${best.label}`,
      detail: `${Math.round(best.pct * 100)}% de las reservas.${
        zones.length > 1 ? ` ${zones[zones.length - 1].label} solo ${Math.round(zones[zones.length - 1].pct * 100)}%: quizá falte oferta ahí.` : ""
      }`,
    });
  }
  return alerts;
}
