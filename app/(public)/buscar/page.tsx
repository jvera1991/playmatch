import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/navbar";
import { CourtCard } from "@/components/court-card";
import { BuscarFiltros } from "@/components/buscar-filtros";
import { findComuna, getCardinalZone, type PuntoCardinal } from "@/lib/medellin";

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ deporte?: string; comuna_id?: string; barrio?: string; cardinal?: string }>;
}) {
  const { deporte = "", comuna_id = "", barrio = "", cardinal = "" } = await searchParams;
  const supabase = await createClient();
  const comuna = findComuna(comuna_id);

  let query = supabase
    .from("courts")
    .select(
      "id, name, sport, price_per_hour, court_photos(url), venues!inner(name, neighborhood, city, comuna, lat, lng)"
    )
    .eq("is_active", true);

  if (deporte) query = query.eq("sport", deporte);
  if (comuna) query = query.eq("venues.comuna", comuna.nombre);
  if (barrio) query = query.eq("venues.neighborhood", barrio);

  const { data: courtsRaw } = await query.order("created_at", { ascending: false });

  const courts = (courtsRaw ?? []).filter((c) => {
    if (!cardinal) return true;
    const venue = c.venues as unknown as { lat: number | null; lng: number | null };
    return getCardinalZone(venue.lat, venue.lng) === (cardinal as PuntoCardinal);
  });

  const queryString = new URLSearchParams({
    ...(deporte ? { deporte } : {}),
    ...(comuna_id ? { comuna_id } : {}),
    ...(barrio ? { barrio } : {}),
    ...(cardinal ? { cardinal } : {}),
  }).toString();

  return (
    <main>
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold text-ink-900">Buscar canchas</h1>
        <p className="text-ink-500">Filtra por deporte, comuna, barrio o punto cardinal.</p>

        <BuscarFiltros
          action="/buscar"
          deporte={deporte}
          comunaId={comuna_id}
          barrio={barrio}
          cardinal={cardinal}
          otroDestino={{ href: `/mapa${queryString ? `?${queryString}` : ""}`, label: "🗺️ Ver en el mapa" }}
        />

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courts.map((court, i) => (
            <CourtCard key={court.id} court={court as never} index={i} />
          ))}
          {!courts.length && (
            <div className="card col-span-full flex flex-col items-center gap-3 py-16 text-center">
              <span className="text-4xl">🔍</span>
              <p className="text-ink-500">No encontramos canchas con esos filtros.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
