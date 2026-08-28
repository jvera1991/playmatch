"use client";

import { useState, type ReactNode } from "react";
import { COMUNAS, PUNTOS_CARDINALES } from "@/lib/medellin";
import { SportIcon, SPORT_LABEL } from "@/components/sport-icon";

const DEPORTES = ["", "futbol", "padel", "voley"] as const;

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
  otroDestino?: { href: string; label: string; icon?: ReactNode };
}) {
  const [comuna, setComuna] = useState(comunaId);
  const comunaSeleccionada = COMUNAS.find((c) => c.id === comuna);

  return (
    <form action={action} className="mt-5 flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {DEPORTES.map((sport) => (
          <label key={sport}>
            <input type="radio" name="deporte" value={sport} defaultChecked={deporte === sport} className="peer hidden" />
            <span className="flex cursor-pointer items-center gap-1.5 rounded-full border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:border-brand-400 peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white">
              {sport && <SportIcon sport={sport} weight="duotone" size={16} />}
              {sport ? SPORT_LABEL[sport] : "Todos"}
            </span>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-end lg:gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink-500">Comuna</label>
          <select
            name="comuna_id"
            className="input w-full lg:w-auto"
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

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink-500">Barrio</label>
          <select name="barrio" className="input w-full lg:w-auto" defaultValue={barrio} disabled={!comunaSeleccionada}>
            <option value="">{comunaSeleccionada ? "Todos" : "Elige comuna"}</option>
            {comunaSeleccionada?.barrios.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink-500">Punto cardinal</label>
          <select name="cardinal" className="input w-full lg:w-auto" defaultValue={cardinal}>
            <option value="">Todos</option>
            {PUNTOS_CARDINALES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary">Buscar</button>
        {otroDestino && (
          <a href={otroDestino.href} className="btn-secondary inline-flex items-center gap-1.5">
            {otroDestino.icon}
            {otroDestino.label}
          </a>
        )}
      </div>
    </form>
  );
}
