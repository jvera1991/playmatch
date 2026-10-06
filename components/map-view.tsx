"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react";
import "leaflet/dist/leaflet.css";

// Mapa con Leaflet + teselas de OpenStreetMap (06/10/2026).
//
// Reemplaza a Google Maps: no necesita llave, cuenta de facturación ni
// tarjeta, y no tiene cuota mensual que vigilar. Si en el futuro el tráfico
// crece mucho, la política de OpenStreetMap pide usar un proveedor de
// teselas propio o comercial: basta con definir NEXT_PUBLIC_MAP_TILE_URL y
// NEXT_PUBLIC_MAP_ATTRIBUTION, sin tocar este código.
//
// Seguridad: el globo de cada cancha se arma con nodos del DOM y
// textContent, NUNCA pegando texto en HTML. La versión anterior insertaba el
// nombre de la cancha (que escribe el dueño) como HTML, lo que permitía XSS
// almacenado: un nombre con <img onerror=...> ejecutaba código en el
// navegador de cada visitante del mapa.

const SPORT_LABEL: Record<string, string> = { futbol: "Fútbol 5", padel: "Pádel", voley: "Vóley" };
const SPORT_EMOJI: Record<string, string> = { futbol: "⚽", padel: "🎾", voley: "🏐" };

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

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
const MEDELLIN_CENTER: [number, number] = [6.2518, -75.5636];

function buildPopup(court: MapCourt): HTMLElement {
  const box = document.createElement("div");
  box.style.minWidth = "170px";
  box.style.fontFamily = "inherit";

  const title = document.createElement("p");
  title.style.cssText = "margin:0;font-weight:600;color:#111";
  title.textContent = court.name;

  const meta = document.createElement("p");
  meta.style.cssText = "margin:2px 0;color:#666;font-size:13px";
  meta.textContent = `${SPORT_LABEL[court.sport] ?? court.sport}${court.venue_name ? ` · ${court.venue_name}` : ""}`;

  const price = document.createElement("p");
  price.style.cssText = "margin:2px 0;font-weight:600;color:#08a06a";
  price.textContent = `$${Number(court.price_per_hour).toLocaleString("es-CO")}/hora`;

  const link = document.createElement("a");
  link.href = `/canchas/${encodeURIComponent(court.id)}`;
  link.style.cssText = "color:#08a06a;font-size:13px;font-weight:600";
  link.textContent = "Ver cancha →";

  box.append(title, meta, price, link);
  return box;
}

export function MapView({ courts }: { courts: MapCourt[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;

    // Leaflet usa `window` al importarse, así que se carga solo en el navegador.
    import("leaflet")
      .then((L) => {
        if (cancelled || !mapRef.current) return;

        map = L.map(mapRef.current, { scrollWheelZoom: true }).setView(
          courts.length ? [courts[0].lat, courts[0].lng] : MEDELLIN_CENTER,
          12
        );

        L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);

        const bounds = L.latLngBounds([]);
        for (const court of courts) {
          const emoji = SPORT_EMOJI[court.sport] ?? "🏟️"; // valor fijo, no viene del usuario
          const icon = L.divIcon({
            className: "",
            html: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9999px;background:#fff;border:2px solid #08a06a;box-shadow:0 2px 6px rgba(0,0,0,.25);font-size:18px">${emoji}</div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            popupAnchor: [0, -16],
          });

          L.marker([court.lat, court.lng], { icon, title: court.name })
            .bindPopup(() => buildPopup(court))
            .addTo(map);
          bounds.extend([court.lat, court.lng]);
        }

        if (courts.length > 1) map.fitBounds(bounds, { padding: [40, 40] });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [courts]);

  if (status === "error") {
    return (
      <div className="card flex flex-col items-center gap-2 p-10 text-center">
        <WarningCircle weight="duotone" size={32} className="text-amber-500" />
        <p className="text-ink-600">No pudimos cargar el mapa en este momento.</p>
        <Link href="/buscar" className="btn-secondary mt-2">
          Ver en lista
        </Link>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={mapRef}
        className="z-0 h-[70vh] w-full overflow-hidden rounded-2xl border border-ink-100 shadow-soft"
      />
      {status === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70">
          <span className="text-ink-500">Cargando mapa…</span>
        </div>
      )}
    </div>
  );
}
