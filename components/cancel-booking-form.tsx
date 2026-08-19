"use client";

import { useState, useTransition } from "react";

// Formulario inline para que el jugador cancele su reserva. Pide el motivo
// exacto (obligatorio) y llama a la acción del servidor, que a su vez
// depende del trigger de base de datos para la regla de las 3 horas — así
// que si por algún error de reloj/caché igual se envía tarde, el servidor
// la rechaza con un mensaje claro en vez de fallar en silencio.
export function CancelBookingForm({
  onCancel,
}: {
  onCancel: (motivo: string) => Promise<{ error?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary !py-1.5 text-xs text-red-700">
        Cancelar reserva
      </button>
    );
  }

  return (
    <div className="mt-2 w-full max-w-sm rounded-lg border border-red-100 bg-red-50/50 p-3">
      <label className="text-xs font-medium text-ink-700">
        Cuéntanos por qué cancelas (obligatorio)
      </label>
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        rows={2}
        className="input mt-1 text-xs"
        placeholder="Ej. Se dañó mi rodilla, cambio de planes, encontré otra cancha más cerca..."
      />
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          disabled={isPending || !motivo.trim()}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await onCancel(motivo.trim());
              if (res.error) setError(res.error);
            })
          }
          className="btn-primary !py-1.5 text-xs disabled:opacity-50"
        >
          {isPending ? "Cancelando..." : "Confirmar cancelación"}
        </button>
        <button onClick={() => setOpen(false)} className="btn-secondary !py-1.5 text-xs">
          Volver
        </button>
      </div>
    </div>
  );
}
