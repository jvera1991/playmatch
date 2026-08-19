"use client";

import { useState } from "react";

type ReservaEvento = {
  tipo: "reserva";
  id: string;
  status: "confirmed" | "pending_payment" | "completed";
  courtName: string;
  venueName: string | null;
  venueAddress: string | null;
  playerName: string | null;
  playerPhone: string | null;
  horaInicio: string;
  horaFin: string;
  fechaLarga: string;
  totalPrice: number;
};

type BloqueoEvento = {
  tipo: "bloqueo";
  id: string;
  courtName: string;
  venueName: string | null;
  venueAddress: string | null;
  reason: string | null;
  horaInicio: string;
  horaFin: string;
  fechaInicioLarga: string;
  fechaFinLarga: string;
  cubreVariosDias: boolean;
};

export type CalendarEvent = ReservaEvento | BloqueoEvento;

const STATUS_STYLE: Record<string, string> = {
  confirmed: "border-brand-200 bg-brand-100 text-brand-800",
  pending_payment: "border-amber-200 bg-amber-100 text-amber-800",
  completed: "border-ink-200 bg-ink-100 text-ink-600",
};
const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmada",
  pending_payment: "Esperando pago",
  completed: "Jugada",
};

// Chip de un evento dentro de una celda del calendario, estilo Google
// Calendar: al pasar el mouse muestra una vista previa flotante y resumida;
// al hacer clic abre el detalle completo en una tarjeta centrada.
export function CalendarEventChip({ event }: { event: CalendarEvent }) {
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);

  const chipClass =
    event.tipo === "bloqueo"
      ? "border-ink-300 bg-ink-200/70 text-ink-700"
      : STATUS_STYLE[event.status] ?? "bg-ink-100 text-ink-600";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className={`w-full truncate rounded border px-1.5 py-0.5 text-left text-[10px] font-medium transition-transform hover:-translate-y-px hover:shadow-sm ${chipClass}`}
      >
        {event.tipo === "bloqueo" ? "🔒 " : ""}
        {event.horaInicio} · {event.courtName}
      </button>

      {/* Vista previa al pasar el mouse — se oculta apenas se abre el detalle */}
      {hovered && !open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 animate-fade-in rounded-lg border border-ink-100 bg-white p-3 text-left shadow-lift">
          {event.tipo === "reserva" ? (
            <>
              <p className="text-xs font-semibold text-ink-900">{event.courtName}</p>
              <p className="mt-0.5 text-[11px] text-ink-500">
                {event.horaInicio} – {event.horaFin}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-500">
                {event.playerName ?? "Jugador"} ·{" "}
                <span className={`badge ${STATUS_STYLE[event.status]}`}>{STATUS_LABEL[event.status]}</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-ink-900">🔒 {event.courtName}</p>
              <p className="mt-0.5 text-[11px] text-ink-500">
                {event.horaInicio} – {event.horaFin}
              </p>
              {event.reason && <p className="mt-0.5 text-[11px] text-ink-500">{event.reason}</p>}
            </>
          )}
        </div>
      )}

      {/* Detalle completo del evento, como al hacer clic en un evento de Google Calendar */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 p-4 animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm animate-fade-up rounded-2xl bg-white p-5 shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            {event.tipo === "reserva" ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-ink-400">Reserva</p>
                    <h3 className="text-lg font-bold text-ink-900">{event.courtName}</h3>
                  </div>
                  <span className={`badge ${STATUS_STYLE[event.status]}`}>{STATUS_LABEL[event.status]}</span>
                </div>

                <div className="mt-4 space-y-2.5 text-sm">
                  <p className="flex items-start gap-2 text-ink-700">
                    <span>📅</span> {event.fechaLarga}
                  </p>
                  <p className="flex items-start gap-2 text-ink-700">
                    <span>🕒</span> {event.horaInicio} – {event.horaFin}
                  </p>
                  {(event.venueName || event.venueAddress) && (
                    <p className="flex items-start gap-2 text-ink-700">
                      <span>📍</span> {event.venueName}
                      {event.venueAddress ? ` — ${event.venueAddress}` : ""}
                    </p>
                  )}
                  <p className="flex items-start gap-2 text-ink-700">
                    <span>🧑</span> {event.playerName ?? "Jugador"}
                    {event.playerPhone ? ` · ${event.playerPhone}` : ""}
                  </p>
                  <p className="flex items-start gap-2 font-semibold text-ink-900">
                    <span>💵</span> ${event.totalPrice.toLocaleString("es-CO")} COP
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs font-medium text-ink-400">Cancha bloqueada por ti</p>
                <h3 className="text-lg font-bold text-ink-900">🔒 {event.courtName}</h3>

                <div className="mt-4 space-y-2.5 text-sm">
                  <p className="flex items-start gap-2 text-ink-700">
                    <span>📅</span>{" "}
                    {event.cubreVariosDias
                      ? `${event.fechaInicioLarga} → ${event.fechaFinLarga}`
                      : event.fechaInicioLarga}
                  </p>
                  <p className="flex items-start gap-2 text-ink-700">
                    <span>🕒</span> {event.horaInicio} – {event.horaFin}
                  </p>
                  {(event.venueName || event.venueAddress) && (
                    <p className="flex items-start gap-2 text-ink-700">
                      <span>📍</span> {event.venueName}
                      {event.venueAddress ? ` — ${event.venueAddress}` : ""}
                    </p>
                  )}
                  {event.reason && (
                    <p className="flex items-start gap-2 text-ink-700">
                      <span>📝</span> {event.reason}
                    </p>
                  )}
                </div>
              </>
            )}

            <button onClick={() => setOpen(false)} className="btn-secondary mt-5 w-full">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
