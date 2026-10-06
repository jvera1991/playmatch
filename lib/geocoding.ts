// Convierte una dirección de texto en coordenadas (lat/lng). Se usa del lado
// del servidor solo cuando un dueño publica o edita una cancha; el resultado
// queda guardado en la base de datos (venues.lat/lng), así que el mapa nunca
// geocodifica en vivo.
//
// Proveedores (06/10/2026):
// 1. Google Geocoding, SOLO si existe GOOGLE_MAPS_SERVER_API_KEY. Es más
//    preciso con direcciones colombianas tipo "Cra 43A # 1-50". Tiene 10.000
//    consultas gratis al mes, pero exige cuenta de facturación en Google Cloud.
// 2. Nominatim (OpenStreetMap): gratis y sin llave. Se usa si no hay llave de
//    Google o si Google falla. Su política exige identificar la app con un
//    User-Agent, máximo 1 consulta por segundo y no usarlo para
//    autocompletar — aquí se cumple de sobra, porque solo se consulta al
//    guardar una cancha. Si no encuentra la dirección exacta, se intenta con
//    barrio/comuna para al menos ubicar la cancha en la zona correcta.
//
// La llave pública del navegador (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) ya no se
// usa: el mapa ahora es Leaflet + OpenStreetMap (components/map-view.tsx).

type Coords = { lat: number; lng: number };

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = `Playmatch/1.0 (${process.env.NEXT_PUBLIC_APP_URL || "playmatch"})`;

// Rectángulo aproximado del Valle de Aburrá: descarta resultados de otras
// ciudades con calles del mismo nombre.
const MEDELLIN_VIEWBOX = "-75.75,6.42,-75.45,6.10";

async function geocodeWithGoogle(address: string, apiKey: string): Promise<Coords | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("region", "co");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    console.error(`[geocode/google] HTTP ${res.status}`);
    return null;
  }
  const data = await res.json();
  if (data.status !== "OK" || !data.results?.length) {
    console.error(`[geocode/google] "${data.status}": ${data.error_message ?? "sin detalle"}`);
    return null;
  }
  const loc = data.results[0].geometry?.location;
  return loc ? { lat: loc.lat, lng: loc.lng } : null;
}

async function geocodeWithNominatim(query: string): Promise<Coords | null> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "co");
  url.searchParams.set("viewbox", MEDELLIN_VIEWBOX);
  url.searchParams.set("bounded", "1");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    console.error(`[geocode/nominatim] HTTP ${res.status}`);
    return null;
  }
  const data = (await res.json()) as { lat: string; lon: string }[];
  if (!data.length) return null;
  const lat = Number(data[0].lat);
  const lng = Number(data[0].lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function geocodeAddress(address: string): Promise<Coords | null> {
  if (!address.trim()) return null;

  try {
    const googleKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (googleKey) {
      const fromGoogle = await geocodeWithGoogle(address, googleKey);
      if (fromGoogle) return fromGoogle;
    }

    // Nominatim: dirección completa y, si no aparece, solo la zona (las
    // direcciones colombianas con "#" suelen no estar en OpenStreetMap).
    const exact = await geocodeWithNominatim(address);
    if (exact) return exact;

    const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      await sleep(1100); // política de Nominatim: máximo 1 consulta por segundo
      const zone = await geocodeWithNominatim(parts.slice(1).join(", "));
      if (zone) return zone;
    }

    console.error(`[geocodeAddress] Sin resultados para "${address}"`);
    return null;
  } catch (err) {
    // Si falla (sin red, timeout...) no bloqueamos la publicación de la
    // cancha: queda sin coordenadas y el dueño puede reintentar desde
    // "Volver a ubicar en el mapa".
    console.error(`[geocodeAddress] Excepción para "${address}":`, err);
    return null;
  }
}
