"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Slot } from "@/lib/availability";

const HORA_BOGOTA = { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" } as const;

export function SlotPicker({ courtId, slots }: { courtId: string; slots: Slot[] }) {
  const [selected, setSelected] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function reservar() {
    if (!selected) return;
    setError(null);

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        court_id: courtId,
        start_at: selected.start.toISOString(),
        end_at: selected.end.toISOString(),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      setError(data.error || "No se pudo crear la reserva.");
      return;
    }

    startTransition(() => {
      router.push(`/reservas/${data.booking.id}/pagar`);
    });
  }

  if (!slots.length) {
    return (
      <p className="text-sm text-ink-400">
        Esta cancha no tiene horario configurado para este día.
      </p>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {slots.map((slot) => {
          const isSelected = selected?.start.getTime() === slot.start.getTime();
          return (
            <button
              key={slot.start.toISOString()}
              disabled={!slot.available}
              onClick={() => setSelected(slot)}
              className={[
                "rounded-lg border px-2 py-2 text-sm font-medium transition-all duration-150",
                !slot.available && "cursor-not-allowed border-ink-100 bg-ink-50 text-ink-200 line-through",
                slot.available && isSelected && "scale-[1.03] border-brand-600 bg-brand-600 text-white shadow-soft",
                slot.available && !isSelected && "border-ink-200 text-ink-700 hover:-translate-y-0.5 hover:border-brand-400 hover:text-brand-700",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {slot.start.toLocaleTimeString("es-CO", HORA_BOGOTA)}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-3 animate-fade-in rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {selected && (
        <button onClick={reservar} disabled={isPending} className="btn-primary mt-4 w-full animate-fade-in">
          {isPending
            ? "Creando reserva..."
            : `Reservar ${selected.start.toLocaleTimeString("es-CO", HORA_BOGOTA)} - ${selected.end.toLocaleTimeString("es-CO", HORA_BOGOTA)}`}
        </button>
      )}
    </div>
  );
}
