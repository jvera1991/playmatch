"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createManualBooking } from "@/app/(owner)/panel/crm-actions";

type CourtOpt = { id: string; name: string; price_per_hour: number };
type CustomerOpt = { key: string; name: string; phone: string | null };

const HOURS = Array.from({ length: 19 }, (_, i) => i + 5); // 5 a.m. a 11 p.m.
const hourLabel = (h: number, m = 0) => {
  const p = h >= 12 ? "p.m." : "a.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${p}`;
};

// Fecha de hoy en Colombia (UTC-5) como YYYY-MM-DD
function todayBogota() {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

// "+ Reserva manual" del calendario (06/10/2026): para reservas que llegan
// por teléfono o en persona. Bloquea el horario en Playmatch (el trigger de
// la base de datos la confirma y aplica el anti-traslape) y crea la ficha
// del cliente si es nuevo. Sin comisión de Playmatch.
export function ManualBookingDialog({
  courts,
  customers,
  autoOpen = false,
}: {
  courts: CourtOpt[];
  customers: CustomerOpt[];
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [state, action, pending] = useActionState(createManualBooking, null);
  const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
  const [duration, setDuration] = useState(60);
  const [customer, setCustomer] = useState("new");
  const [price, setPrice] = useState<number>(courts[0]?.price_per_hour ?? 0);
  const [priceTouched, setPriceTouched] = useState(false);

  const court = useMemo(() => courts.find((c) => c.id === courtId), [courts, courtId]);

  // Sugiere el precio de la cancha según la duración, hasta que el dueño lo edite
  useEffect(() => {
    if (!priceTouched && court) setPrice(Math.round((court.price_per_hour * duration) / 60));
  }, [court, duration, priceTouched]);

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => setOpen(false), 1200);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (!courts.length) return null;

  return (
    <>
      <button type="button" className="btn-primary !px-3 !py-2 text-sm" onClick={() => setOpen(true)}>
        + Reserva manual
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 p-4 animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <form
            action={action}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-lift animate-fade-up"
            role="dialog"
            aria-label="Nueva reserva manual"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-ink-900">Nueva reserva manual</h2>
                <p className="text-xs text-ink-500">Para clientes que te reservan por teléfono o en persona.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-ink-400 hover:text-ink-700" aria-label="Cerrar">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 text-xs font-semibold text-ink-600">
                Cancha
                <select
                  id="mb-court"
                  name="court_id"
                  value={courtId}
                  onChange={(e) => setCourtId(e.target.value)}
                  className="input mt-1"
                >
                  {courts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold text-ink-600">
                Fecha
                <input id="mb-date" type="date" name="date" required defaultValue={todayBogota()} className="input mt-1" />
              </label>

              <label className="text-xs font-semibold text-ink-600">
                Hora de inicio
                <select id="mb-start" name="start" defaultValue="19:00" className="input mt-1">
                  {HOURS.flatMap((h) => [0, 30].map((m) => ({ h, m }))).map(({ h, m }) => (
                    <option key={`${h}-${m}`} value={`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`}>
                      {hourLabel(h, m)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold text-ink-600">
                Duración
                <select
                  id="mb-duration"
                  name="duration"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="input mt-1"
                >
                  <option value={60}>1 hora</option>
                  <option value={90}>1 hora y media</option>
                  <option value={120}>2 horas</option>
                  <option value={180}>3 horas</option>
                </select>
              </label>

              <label className="text-xs font-semibold text-ink-600">
                Valor cobrado (COP)
                <input
                  id="mb-price"
                  name="price"
                  type="number"
                  min={0}
                  step={1000}
                  value={price}
                  onChange={(e) => {
                    setPriceTouched(true);
                    setPrice(Number(e.target.value));
                  }}
                  className="input mt-1"
                />
              </label>

              <label className="col-span-2 text-xs font-semibold text-ink-600">
                Cliente
                <select
                  id="mb-customer"
                  name="customer"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  className="input mt-1"
                >
                  <option value="new">+ Cliente nuevo</option>
                  {customers.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {customer === "new" && (
                <>
                  <label className="text-xs font-semibold text-ink-600">
                    Nombre
                    <input id="mb-new-name" name="new_name" required maxLength={120} className="input mt-1" />
                  </label>
                  <label className="text-xs font-semibold text-ink-600">
                    WhatsApp
                    <input
                      id="mb-new-phone"
                      name="new_phone"
                      inputMode="tel"
                      maxLength={30}
                      placeholder="300 123 4567"
                      className="input mt-1"
                    />
                  </label>
                </>
              )}

              <label className="col-span-2 text-xs font-semibold text-ink-600">
                ¿Cómo pagó?
                <select id="mb-payment" name="payment_method" defaultValue="efectivo" className="input mt-1">
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="pendiente">Pendiente (paga en la cancha)</option>
                </select>
              </label>
            </div>

            <p className="rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-600">
              Ese horario queda bloqueado en Playmatch para que nadie más lo reserve en línea. Las reservas
              manuales no pagan comisión.
            </p>

            {state && (
              <p className={`text-sm font-medium ${state.ok ? "text-brand-700" : "text-red-700"}`} role={state.ok ? "status" : "alert"}>
                {state.ok ? state.message : state.error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button className="btn-primary" disabled={pending}>
                {pending ? "Guardando…" : "Guardar reserva"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
