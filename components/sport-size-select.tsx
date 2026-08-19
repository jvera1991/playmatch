"use client";

import { useState } from "react";
import { COURT_SIZES } from "@/lib/court-sizes";

const DEPORTES = [
  { value: "futbol", label: "⚽ Fútbol sintético" },
  { value: "padel", label: "🎾 Pádel" },
  { value: "voley", label: "🏐 Vóley" },
];

// Deporte + formato/tamaño de la cancha en cascada (5vs5, 7vs7, dobles, etc.)
// — importante para que el jugador sepa qué esperar antes de reservar.
export function SportSizeSelect({
  defaultSport = "futbol",
  defaultSize,
}: {
  defaultSport?: string;
  defaultSize?: string;
}) {
  const [sport, setSport] = useState(defaultSport);
  const sizes = COURT_SIZES[sport] ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className="text-sm font-medium text-ink-700">Deporte</label>
        <select
          name="sport"
          required
          className="input mt-1"
          value={sport}
          onChange={(e) => setSport(e.target.value)}
        >
          {DEPORTES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium text-ink-700">Tamaño / formato</label>
        <select name="size" required className="input mt-1" defaultValue={defaultSize ?? ""}>
          <option value="" disabled>
            Elige el formato
          </option>
          {sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
