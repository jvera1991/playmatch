import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getAvailableSlots } from "@/lib/availability";
import { COMUNAS, getCardinalZone, type PuntoCardinal } from "@/lib/medellin";

// La IA manda nombres en lenguaje natural (ej. "El Poblado", "Laureles") en
// vez de los ids internos ("comuna-14"), así que hacemos match flexible por
// id exacto o por texto contenido en el nombre de la comuna (sin tildes).
function resolverComuna(input: string) {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const target = norm(input);
  return (
    COMUNAS.find((c) => c.id === input) ??
    COMUNAS.find((c) => norm(c.nombre).includes(target) || target.includes(norm(c.nombre))) ??
    null
  );
}

// Endpoint de "herramienta" para la IA (y, más adelante, para el flujo de
// WhatsApp vía n8n): búsqueda de canchas de solo lectura, reutilizando la
// MISMA lógica de disponibilidad que ya usan /buscar, /mapa y /canchas/[id].
// No requiere sesión de usuario (info pública), pero SIEMPRE consulta
// is_active/is_approved igual que las páginas públicas.
//
// No crea reservas ni escribe nada — solo busca y calcula disponibilidad.

function hoyBogota() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

export async function POST(req: NextRequest) {
  let body: {
    deporte?: string;
    comuna?: string; // nombre o id de comuna, ej. "Comuna 14 - El Poblado" o "comuna-14"
    barrio?: string;
    cardinal?: string;
    fecha?: string; // "YYYY-MM-DD", por defecto hoy (Bogotá)
    precio_max?: number;
    limite?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const {
    deporte = "",
    comuna: comunaInput = "",
    barrio = "",
    cardinal = "",
    fecha,
    precio_max,
    limite = 8,
  } = body;

  if (deporte && !["futbol", "padel", "voley"].includes(deporte)) {
    return NextResponse.json(
      { error: "deporte inválido, debe ser futbol, padel o voley" },
      { status: 400 }
    );
  }

  const dateStr = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoyBogota();
  const comuna = comunaInput ? resolverComuna(comunaInput) : undefined;

  const supabase = createAdminClient();

  let query = supabase
    .from("courts")
    .select(
      "id, name, sport, size, is_covered, price_per_hour, slot_duration_minutes, venues!inner(name, neighborhood, city, comuna, address, lat, lng)"
    )
    .eq("is_active", true)
    .eq("is_approved", true);

  if (deporte) query = query.eq("sport", deporte);
  if (comuna) query = query.eq("venues.comuna", comuna.nombre);
  if (barrio) query = query.eq("venues.neighborhood", barrio);
  if (typeof precio_max === "number") query = query.lte("price_per_hour", precio_max);

  const { data: courtsRaw, error } = await query.limit(40);

  if (error) {
    return NextResponse.json({ error: "Error consultando canchas" }, { status: 500 });
  }

  const candidatos = (courtsRaw ?? []).filter((c) => {
    if (!cardinal) return true;
    const venue = c.venues as unknown as { lat: number | null; lng: number | null };
    return getCardinalZone(venue.lat, venue.lng) === (cardinal as PuntoCardinal);
  });

  const dayStart = `${dateStr}T00:00:00-05:00`;
  const dayEnd = `${dateStr}T23:59:59-05:00`;

  // Para cada cancha candidata, calculamos disponibilidad real del día
  // (mismo cruce de horarios/cierres/reservas que /canchas/[id]).
  const resultados = await Promise.all(
    candidatos.map(async (c) => {
      const venue = c.venues as unknown as {
        name: string;
        neighborhood: string;
        city: string;
        address: string;
        lat: number | null;
        lng: number | null;
      };

      const [{ data: schedules }, { data: closures }, { data: bookings }] = await Promise.all([
        supabase.from("court_schedules").select("day_of_week, open_time, close_time").eq("court_id", c.id),
        supabase
          .from("court_closures")
          .select("start_at, end_at")
          .eq("court_id", c.id)
          .lt("start_at", dayEnd)
          .gt("end_at", dayStart),
        supabase
          .from("bookings")
          .select("start_at, end_at")
          .eq("court_id", c.id)
          .in("status", ["pending_payment", "confirmed"])
          .lt("start_at", dayEnd)
          .gt("end_at", dayStart),
      ]);

      const slots = getAvailableSlots({
        dateStr,
        slotMinutes: c.slot_duration_minutes,
        schedules: schedules ?? [],
        closures: closures ?? [],
        bookings: bookings ?? [],
      });

      const disponibles = slots.filter((s) => s.available);

      return {
        id: c.id,
        nombre: c.name,
        deporte: c.sport,
        tamano: c.size,
        cubierta: c.is_covered,
        precio_por_hora: c.price_per_hour,
        sede: venue.name,
        barrio: venue.neighborhood,
        ciudad: venue.city,
        direccion: venue.address,
        horarios_disponibles_hoy: disponibles.map((s) =>
          s.start.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })
        ),
        cantidad_horarios_disponibles: disponibles.length,
        url: `/canchas/${c.id}?fecha=${dateStr}`,
      };
    })
  );

  // Priorizamos canchas con disponibilidad real ese día.
  const ordenados = resultados
    .sort((a, b) => b.cantidad_horarios_disponibles - a.cantidad_horarios_disponibles)
    .slice(0, Math.min(limite, 20));

  return NextResponse.json({
    fecha_consultada: dateStr,
    total_encontradas: resultados.length,
    canchas: ordenados,
  });
}
