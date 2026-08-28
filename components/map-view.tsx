"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapTrifold, WarningCircle } from "@phosphor-icons/react";

const SPORT_LABEL: Record<string, string> = { futbol: "Fútbol 5", padel: "Pádel", voley: "Vóley" };
const SPORT_EMOJI: Record<string, string> = { futbol: "⚽", padel: "🎾", voley: "🏐" };

export interface MapCourt {
  id: string;
  name: string;
  sport: string;
  price_per_hour: number;
  lat: number;
  lng: number;
  venue_name: string | null;
}

// Centro de Medellín, usado cuando no hay canchas geolocalizadas todavía.
const MEDELLIN_CENTER = { lat: 6.2518, lng: -75.5636 };

let scriptLoadingPromise: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as unknown as { google?: unknown }).google) return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    // Sin "loading=async": así el script carga google.maps.Map de forma
    // síncrona al terminar, en vez de requerir google.maps.importLibrary().
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
    document.head.appendChild(script);
  });

  return scriptLoadingPromise;
}

export function MapView({ courts, apiKey }: { courts: MapCourt[]; apiKey: string | null }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "no-key" | "load-error">("loading");
  const [errorDetail, setErrorDetail] = useState<string>("");

  useEffect(() => {
    if (!apiKey) {
      setStatus("no-key");
      return;
    }

    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !mapRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const google = (window as any).google;

        const center = courts.length
          ? { lat: courts[0].lat, lng: courts[0].lng }
          : MEDELLIN_CENTER;

        const map = new google.maps.Map(mapRef.current, {
          center,
          zoom: courts.length ? 12 : 12,
          // Ocultamos los íconos de otros negocios (restaurantes, centros
          // comerciales, hospitales, etc.) y transporte público que Google
          // muestra por defecto — en Playmatch solo queremos ver canchas.
          // Nota: "mapId" y "styles" son mutuamente excluyentes (con mapId,
          // el estilo se controla desde Google Cloud Console), por eso no
          // usamos mapId aquí.
          styles: [
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
          ],
        });

        if (courts.length) {
          const bounds = new google.maps.LatLngBounds();
          const infoWindow = new google.maps.InfoWindow();

          for (const court of courts) {
            const marker = new google.maps.Marker({
              position: { lat: court.lat, lng: court.lng },
              map,
              title: court.name,
              label: { text: SPORT_EMOJI[court.sport] ?? "🏟️", fontSize: "16px" },
            });

            marker.addListener("click", () => {
              infoWindow.setContent(
                `<div style="font-family:sans-serif;min-width:160px">
                  <p style="margin:0;font-weight:600">${court.name}</p>
                  <p style="margin:2px 0;color:#666;font-size:13px">${SPORT_LABEL[court.sport] ?? court.sport} · ${court.venue_name ?? ""}</p>
                  <p style="margin:2px 0;font-weight:600;color:#08a06a">$${court.price_per_hour.toLocaleString("es-CO")}/hora</p>
                  <a href="/canchas/${court.id}" style="color:#08a06a;font-size:13px;font-weight:600">Ver cancha →</a>
                </div>`
              );
              infoWindow.open(map, marker);
            });

            bounds.extend({ lat: court.lat, lng: court.lng });
          }

          if (courts.length > 1) map.fitBounds(bounds);
        }

        setStatus("ready");
      })
      .catch((err) => {
        setErrorDetail(err?.message ?? "desconocido");
        setStatus("load-error");
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, courts]);

  if (status === "no-key") {
    return (
      <div className="card flex flex-col items-center gap-2 p-10 text-center">
        <MapTrifold weight="duotone" size={32} className="text-brand-500" />
        <p className="text-ink-600">
          El mapa no está disponible en este momento (falta configurar la llave de Google Maps).
        </p>
        <p className="text-sm text-ink-400">Puedes seguir buscando canchas desde la lista.</p>
        <Link href="/buscar" className="btn-secondary mt-2">
          Ver en lista
        </Link>
      </div>
    );
  }

  if (status === "load-error") {
    return (
      <div className="card flex flex-col items-center gap-2 p-10 text-center">
        <WarningCircle weight="duotone" size={32} className="text-amber-500" />
        <p className="text-ink-600">
          Google Maps rechazó la solicitud (la llave sí llegó, pero algo la está bloqueando).
        </p>
        <p className="max-w-md text-xs text-ink-400">
          Detalle técnico: {errorDetail}. Revisa en Google Cloud → Credenciales → tu llave, que no
          tenga restricciones de "Referentes HTTP" que bloqueen localhost, o abre la consola del
          navegador (F12) y busca un mensaje que empiece con "Google Maps JavaScript API error".
        </p>
        <Link href="/buscar" className="btn-secondary mt-2">
          Ver en lista
        </Link>
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={mapRef} className="h-[70vh] w-full overflow-hidden rounded-2xl border border-ink-100 shadow-soft" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70">
          <span className="text-ink-500">Cargando mapa…</span>
        </div>
      )}
    </div>
  );
}
