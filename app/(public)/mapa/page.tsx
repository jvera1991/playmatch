import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/navbar";
import { BuscarFiltros } from "@/components/buscar-filtros";
import { MapView, type MapCourt } from "@/components/map-view";
import { findComuna, getCardinalZone, type PuntoCardinal } from "@/lib/medellin";
import { ListBullets } from "@phosphor-icons/react/ssr";

export default async function MapaPage({
  searchParams,
}: {
  searchParams: Promise<{ deporte?: string; comuna_id?: string; barrio?: string; cardinal?: string }>;
}) {
  const { deporte = "", comuna_id = "", barrio = "", cardinal = "" } = await searchParams;
  const supabase = await createClient();
  const comuna = findComuna(comuna_id);

  let query = supabase
    .from("courts")
    .select("id, name, sport, price_per_hour, venues!inner(name, neighborhood, city, comuna, lat, lng)")
    .eq("is_active", true)
    .eq("is_approved", true);

  if (deporte) query = query.eq("sport", deporte);
  if (comuna) query = query.eq("venues.comuna", comuna.nombre);
  if (barrio) query = query.eq("venues.neighborhood", barrio);

  const { data: courtsRaw } = await query;

  const conCoordenadas = (courtsRaw ?? [])
    .map((c) => {
      const venue = c.venues as unknown as {
        name: string;
        lat: number | null;
        lng: number | null;
      };
      return {
        id: c.id as string,
        name: c.name as string,
        sport: c.sport as string,
        price_per_hour: c.price_per_hour as number,
        venue_name: venue.name,
        lat: venue.lat,
        lng: venue.lng,
      };
    })
    // Solo podemos mostrar en el mapa las canchas que ya tienen coordenadas
    // (se calculan solas al publicar, con la dirección + Google Geocoding).
    .filter((c) => c.lat != null && c.lng != null);

  const courts: MapCourt[] = conCoordenadas
    .filter((c) => !cardinal || getCardinalZone(c.lat, c.lng) === (cardinal as PuntoCardinal))
    .map((c) => ({ ...c, lat: c.lat as number, lng: c.lng as number }));

  const sinCoordenadas = (courtsRaw?.length ?? 0) - courts.length;

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
        <h1 className="text-2xl font-bold text-ink-900">Canchas en el mapa</h1>
        <p className="text-ink-500">Filtra y explora las canchas disponibles en Medellín.</p>

        <BuscarFiltros
          action="/mapa"
          deporte={deporte}
          comunaId={comuna_id}
          barrio={barrio}
          cardinal={cardinal}
          otroDestino={{
            href: `/buscar${queryString ? `?${queryString}` : ""}`,
            label: "Ver en lista",
            icon: <ListBullets size={16} weight="bold" />,
          }}
        />

        <div className="mt-6">
          <MapView courts={courts} apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null} />
        </div>

        {sinCoordenadas > 0 && (
          <p className="mt-3 text-center text-xs text-ink-400">
            {sinCoordenadas} cancha(s) con esos filtros aún no tienen ubicación exacta y no aparecen en
            el mapa (sí en la búsqueda por lista).
          </p>
        )}
      </div>
    </main>
  );
}
