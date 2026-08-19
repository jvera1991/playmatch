// Convierte una dirección de texto en coordenadas (lat/lng) usando la API de
// Geocodificación de Google. Se usa del lado del servidor cuando un dueño
// publica o edita una cancha, para que el mapa pueda ubicarla con precisión.
//
// IMPORTANTE — dos llaves distintas, no una sola:
// La llave de Google Maps que se usa en el navegador (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
// normalmente está restringida por "HTTP referrer" (solo acepta llamadas desde
// localhost:3000/* o playmatch.co/*). Esa restricción es correcta para el mapa
// que ve el usuario en su navegador, PERO esta función corre en el SERVIDOR
// (Node.js), y las llamadas servidor-a-servidor no envían un header "Referer"
// de navegador — Google las rechaza igual que si el dominio no estuviera
// permitido, y esta función queda sin coordenadas para siempre en silencio.
//
// Por eso esta función usa GOOGLE_MAPS_SERVER_API_KEY primero (una llave
// SEPARADA, sin restricción de HTTP referrer — restringida por IP del
// servidor, o sin restricción de aplicación pero limitada solo a
// "Geocoding API" en "Restricciones de API"). Si no existe, cae de vuelta a
// la llave pública, que en producción con el referrer restringido fallará
// para geocodificación (por eso "Cancha 1" quedó sin ubicación).
//
// Cómo crear la llave de servidor: Google Cloud Console → Credenciales →
// Crear credenciales → Clave de API → en "Restricciones de aplicación"
// elegir "Ninguna" (o "Direcciones IP" con la IP del VPS) → en
// "Restricciones de API" limitarla solo a "Geocoding API". Luego agregar
// GOOGLE_MAPS_SERVER_API_KEY=esa-llave en .env.local / .env de producción.
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey || !address.trim()) return null;

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("region", "co");

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`[geocodeAddress] HTTP ${res.status} para "${address}"`);
      return null;
    }

    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) {
      // Logueamos la razón real en vez de fallar en silencio total — esto es
      // lo que habría mostrado de inmediato por qué "Cancha 1" no se geocodificó
      // (status "REQUEST_DENIED" con error_message mencionando el referrer).
      console.error(
        `[geocodeAddress] Google respondió "${data.status}" para "${address}": ${data.error_message ?? "sin detalle"}`
      );
      return null;
    }

    const location = data.results[0].geometry?.location;
    if (!location) return null;

    return { lat: location.lat, lng: location.lng };
  } catch (err) {
    // Si falla la geocodificación (sin red, etc.) no bloqueamos la
    // publicación de la cancha — simplemente queda sin coordenadas y no
    // aparecerá en el mapa hasta que se corrija.
    console.error(`[geocodeAddress] Excepción para "${address}":`, err);
    return null;
  }
}
