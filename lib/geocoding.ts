// Convierte una dirección de texto en coordenadas (lat/lng) usando la API de
// Geocodificación de Google. Se usa del lado del servidor cuando un dueño
// publica una cancha, para que el mapa pueda ubicarla con precisión.
// Requiere la variable de entorno NEXT_PUBLIC_GOOGLE_MAPS_API_KEY con el
// proyecto de Google Cloud teniendo habilitada "Geocoding API".
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey || !address.trim()) return null;

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("region", "co");

    const res = await fetch(url.toString());
    if (!res.ok) return null;

    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) return null;

    const location = data.results[0].geometry?.location;
    if (!location) return null;

    return { lat: location.lat, lng: location.lng };
  } catch {
    // Si falla la geocodificación (llave inválida, sin red, etc.) no
    // bloqueamos la publicación de la cancha — simplemente queda sin
    // coordenadas y no aparecerá en el mapa hasta que se corrija.
    return null;
  }
}
