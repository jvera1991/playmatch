"use client";

import { useState } from "react";
import { COMUNAS } from "@/lib/medellin";

// Selector en cascada: al elegir una comuna, el select de barrio se llena
// solo con los barrios de esa comuna. Se usan inputs ocultos con los mismos
// "name" que antes usaba el formulario (comuna, neighborhood) para que el
// server action que procesa el formulario no tenga que cambiar.
export function ComunaBarrioSelect({
  defaultComunaId,
  defaultBarrio,
}: {
  defaultComunaId?: string;
  defaultBarrio?: string;
}) {
  const [comunaId, setComunaId] = useState(defaultComunaId ?? "");
  const comuna = COMUNAS.find((c) => c.id === comunaId);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className="text-sm font-medium text-ink-700">Comuna</label>
        <select
          name="comuna_id"
          required
          className="input mt-1"
          value={comunaId}
          onChange={(e) => setComunaId(e.target.value)}
        >
          <option value="" disabled>
            Elige la comuna
          </option>
          {COMUNAS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium text-ink-700">Barrio</label>
        <select
          name="neighborhood"
          required
          className="input mt-1"
          defaultValue={defaultBarrio ?? ""}
          disabled={!comuna}
        >
          <option value="" disabled>
            {comuna ? "Elige el barrio" : "Primero elige la comuna"}
          </option>
          {comuna?.barrios.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
