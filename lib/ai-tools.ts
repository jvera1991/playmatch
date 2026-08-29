import { createAdminClient } from "@/lib/supabase/server";
import { getAvailableSlots } from "@/lib/availability";
import { COMUNAS, getCardinalZone, type PuntoCardinal } from "@/lib/medellin";

// Lógica de las "herramientas" de solo lectura que usa el asistente de IA
// (y, más adelante, el flujo de WhatsApp vía n8n). Vive aquí, separada de la
// ruta HTTP, para que /api/ai/chat pueda llamarla DIRECTAMENTE como función
// en vez de hacerle un fetch a su propia URL pública — un self-fetch dentro
// del mismo contenedor puede fallar según cómo el proxy/dominio esté
// configurado (EasyPanel/Traefik), así que evitamos esa clase de error por
// completo. /api/ai/canchas/buscar sigue existiendo como endpoint HTTP para
// que n8n (fuera del contenedor) sí pueda llamarlo por red.

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

function hoyBogota() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

export interface BuscarCanchasArgs {
  deporte?: string;
  comuna?: string;
  barrio?: string;
  cardinal?: string;
  fecha?: string;
  precio_max?: number;
  limite?: number;
}

export async function buscarCanchas(args: BuscarCanchasArgs) {
  const { deporte = "", comuna: comunaInput = "", barrio = "", cardinal = "", fecha, precio_max, limite = 8 } = args;

  if (deporte && !["futbol", "padel", "voley"].includes(deporte)) {
    return { error: "deporte inválido, debe ser futbol, padel o voley" };
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

  // Se limita a 20 candidatos (antes 40): cada uno dispara 3 consultas más
  // (horarios/cierres/reservas) para calcular disponibilidad real, así que
  // el fan-out por request ya es alto — sumado al rate limit del endpoint,
  // esto acota el costo máximo de una sola búsqueda sobre Supabase.
  const { data: courtsRaw, error } = await query.limit(20);

  if (error) {
    return { error: "Error consultando canchas" };
  }

  const candidatos = (courtsRaw ?? []).filter((c) => {
    if (!cardinal) return true;
    const venue = c.venues as unknown as { lat: number | null; lng: number | null };
    return getCardinalZone(venue.lat, venue.lng) === (cardinal as PuntoCardinal);
  });

  const dayStart = `${dateStr}T00:00:00-05:00`;
  const dayEnd = `${dateStr}T23:59:59-05:00`;

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

  const ordenados = resultados
    .sort((a, b) => b.cantidad_horarios_disponibles - a.cantidad_horarios_disponibles)
    .slice(0, Math.min(limite, 20));

  return {
    fecha_consultada: dateStr,
    total_encontradas: resultados.length,
    canchas: ordenados,
  };
}
