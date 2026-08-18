"use client";

import { useState } from "react";
import { COMUNAS, PUNTOS_CARDINALES } from "@/lib/medellin";

const DEPORTES = [
  { value: "", label: "Todos" },
  { value: "futbol", label: "⚽ Fútbol 5" },
  { value: "padel", label: "🎾 Pádel" },
  { value: "voley", label: "🏐 Vóley" },
] as const;

// Formulario de filtros compartido entre /buscar (lista) y /mapa. Es un
// <form> normal con GET — funciona sin JavaScript, y con JS habilitado el
// select de barrio se actualiza en cascada según la comuna elegida.
export function BuscarFiltros({
  action,
  deporte = "",
  comunaId = "",
  barrio = "",
  cardinal = "",
  otroDestino,
}: {
  action: string;
  deporte?: string;
  comunaId?: string;
  barrio?: string;
  cardinal?: string;
  /** Enlace a la vista alterna (mapa ↔ lista) conservando los filtros actuales. */
  otroDestino?: { href: string; label: string };
}) {
  const [comuna, setComuna] = useState(comunaId);
  const comunaSeleccionada = COMUNAS.find((c) => c.id === comuna);

  return (
    <form action={action} className="mt-5 flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap gap-2">
        {DEPORTES.map((d) => (
          <label key={d.value}>
            <input type="radio" name="deporte" value={d.value} defaultChecked={deporte === d.value} className="peer hidden" />
            <span className="cursor-pointer rounded-full border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:border-brand-400 peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white">
              {d.label}
            </span>
          </label>
        ))}
      </div>

      <div>
        <label className="text-xs font-medium text-ink-500">Comuna</label>
        <select
          name="comuna_id"
          className="input mt-0.5 w-auto"
          value={comuna}
          onChange={(e) => setComuna(e.target.value)}
        >
          <option value="">Todas</option>
          {COMUNAS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-ink-500">Barrio</label>
        <select name="barrio" className="input mt-0.5 w-auto" defaultValue={barrio} disabled={!comunaSeleccionada}>
          <option value="">{comunaSeleccionada ? "Todos" : "Elige comuna"}</option>
          {comunaSeleccionada?.barrios.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-ink-500">Punto cardinal</label>
        <select name="cardinal" className="input mt-0.5 w-auto" defaultValue={cardinal}>
          <option value="">Todos</option>
          {PUNTOS_CARDINALES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <button className="btn-primary">Buscar</button>

      {otroDestino && (
        <a href={otroDestino.href} className="btn-secondary">
          {otroDestino.label}
        </a>
      )}
    </form>
  );
}
