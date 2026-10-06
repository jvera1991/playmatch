"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createBlock, type BlockResult } from "@/app/(owner)/panel/block-actions";

type CourtOpt = { id: string; name: string };

export const BLOCK_CATEGORIES = [
  { k: "escuela", label: "⚽ Escuela de fútbol" },
  { k: "evento", label: "🎉 Evento privado" },
  { k: "torneo", label: "🏆 Torneo" },
  { k: "mantenimiento", label: "🛠 Mantenimiento" },
  { k: "otro", label: "Otro" },
] as const;

const DAY_LETTERS = ["D", "L", "M", "M", "J", "V", "S"];
const DAY_NAMES = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

// 5:00 a.m. a 12:00 a.m. (medianoche), cada 30 minutos
const TIMES = Array.from({ length: 39 }, (_, i) => 300 + i * 30).map((m) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const value = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  const hh = h % 24;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return { value, label: `${h12}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "p.m." : "a.m."}` };
});

function todayBogota() {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function countDays(from: string, until: string, days: number[]) {
  if (!from || !until || until < from) return 0;
  let n = 0;
  for (let d = from, g = 0; d <= until && g < 400; d = addDays(d, 1), g++) {
    if (days.includes(new Date(d + "T12:00:00Z").getUTCDay())) n++;
  }
  return n;
}
const fmtShort = (date: string) => {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][m - 1]}`;
};

// "🔒 Bloquear horario" del calendario (06/10/2026): escuelas de fútbol,
// eventos privados, etc. Una vez o cada semana. Las franjas que chocan con
// reservas se saltan (con aviso previo) — nunca se cancela a nadie.
export function BlockDialog({ courts }: { courts: CourtOpt[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<BlockResult | null, FormData>(createBlock, null);
  const [court, setCourt] = useState(courts.length > 1 ? "all" : courts[0]?.id ?? "");
  const [category, setCategory] = useState<string>("escuela");
  const [mode, setMode] = useState<"once" | "weekly">("once");
  const [date, setDate] = useState(todayBogota());
  const [until, setUntil] = useState(addDays(todayBogota(), 56));
  const [from, setFrom] = useState("16:00");
  const [to, setTo] = useState("18:00");
  const [days, setDays] = useState<number[]>([]);

  // Al pasar a "cada semana", preselecciona el día de la fecha elegida
  useEffect(() => {
    if (mode === "weekly" && days.length === 0) setDays([new Date(date + "T12:00:00Z").getUTCDay()]);
  }, [mode, date, days.length]);

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => setOpen(false), 1400);
      return () => clearTimeout(t);
    }
  }, [state]);

  const occurrences = useMemo(
    () => (mode === "once" ? 1 : countDays(date, until, days)),
    [mode, date, until, days]
  );
  const courtsCount = court === "all" ? courts.length : 1;
  const fromLabel = TIMES.find((t) => t.value === from)?.label ?? from;
  const toLabel = TIMES.find((t) => t.value === to)?.label ?? to;
  const daysText = [...days].sort().map((d) => DAY_NAMES[d]).join(", ").replace(/, ([^,]*)$/, " y $1");

  if (!courts.length) return null;
  const needsConfirm = state && !state.ok && "needsConfirm" in state;

  return (
    <>
      <button
        type="button"
        className="btn-secondary !border-ink-900 !bg-ink-900 !px-3 !py-2 text-sm !text-white hover:!bg-ink-800"
        onClick={() => setOpen(true)}
      >
        🔒 Bloquear horario
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
            aria-label="Bloquear horario"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-ink-900">Bloquear horario</h2>
                <p className="text-xs text-ink-500">Nadie podrá reservar en línea en ese horario.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-ink-400 hover:text-ink-700" aria-label="Cerrar">
                ✕
              </button>
            </div>

            <label className="text-xs font-semibold text-ink-600">
              Cancha
              <select name="court" value={court} onChange={(e) => setCourt(e.target.value)} className="input mt-1">
                {courts.length > 1 && <option value="all">Todas mis canchas</option>}
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="text-xs font-semibold text-ink-600">
              <legend>Motivo</legend>
              <input type="hidden" name="category" value={category} />
              <div className="mt-1 flex flex-wrap gap-1.5">
                {BLOCK_CATEGORIES.map((c) => (
                  <button
                    key={c.k}
                    type="button"
                    onClick={() => setCategory(c.k)}
                    aria-pressed={category === c.k}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      category === c.k
                        ? "border-brand-500 bg-brand-50 text-brand-800"
                        : "border-ink-200 text-ink-600 hover:bg-ink-50"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="text-xs font-semibold text-ink-600">
              Nota (opcional)
              <input name="note" maxLength={200} placeholder="Ej: Escuela Los Pibes, sub-12" className="input mt-1" />
            </label>

            <fieldset className="text-xs font-semibold text-ink-600">
              <legend>¿Se repite?</legend>
              <input type="hidden" name="mode" value={mode} />
              <div className="mt-1 flex overflow-hidden rounded-xl border border-ink-200">
                {(["once", "weekly"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={`flex-1 py-2 text-sm font-semibold ${mode === m ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-50"}`}
                  >
                    {m === "once" ? "Una sola vez" : "Cada semana"}
                  </button>
                ))}
              </div>
            </fieldset>

            {mode === "weekly" && (
              <fieldset className="text-xs font-semibold text-ink-600">
                <legend>Días</legend>
                <div className="mt-1 flex gap-1.5">
                  {DAY_LETTERS.map((l, i) => {
                    const on = days.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={on}
                        aria-label={DAY_NAMES[i]}
                        onClick={() => setDays((p) => (on ? p.filter((x) => x !== i) : [...p, i]))}
                        className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold ${
                          on ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 text-ink-600 hover:bg-ink-50"
                        }`}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
                {days.map((d) => (
                  <input key={d} type="hidden" name="days" value={d} />
                ))}
              </fieldset>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-ink-600">
                Desde
                <select name="from" value={from} onChange={(e) => setFrom(e.target.value)} className="input mt-1">
                  {TIMES.slice(0, -1).map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-ink-600">
                Hasta
                <select name="to" value={to} onChange={(e) => setTo(e.target.value)} className="input mt-1">
                  {TIMES.slice(1).map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-ink-600">
                {mode === "once" ? "Fecha" : "Empieza"}
                <input
                  type="date"
                  name="date"
                  required
                  min={todayBogota()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="input mt-1"
                />
              </label>
              {mode === "weekly" && (
                <label className="text-xs font-semibold text-ink-600">
                  Termina
                  <input
                    type="date"
                    name="until"
                    required
                    min={date}
                    max={addDays(date, 183)}
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                    className="input mt-1"
                  />
                </label>
              )}
            </div>

            <p className="rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-600">
              {to <= from ? (
                "La hora final debe ser después de la de inicio."
              ) : mode === "once" ? (
                <>
                  Se bloqueará el <b>{fmtShort(date)}</b> de {fromLabel} a {toLabel}
                  {courtsCount > 1 ? ` en tus ${courtsCount} canchas` : ""}.
                </>
              ) : occurrences === 0 ? (
                "Elige al menos un día de la semana."
              ) : (
                <>
                  Se bloquearán <b>{occurrences * courtsCount} franjas</b>: {daysText} de {fromLabel} a {toLabel}, del{" "}
                  {fmtShort(date)} al {fmtShort(until)}
                  {courtsCount > 1 ? ` (en ${courtsCount} canchas)` : ""}.
                </>
              )}
            </p>

            {needsConfirm && "conflicts" in state && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800" role="alert">
                <p>
                  <b>
                    {state.conflicts.length} {state.conflicts.length === 1 ? "franja ya tiene" : "franjas ya tienen"} reservas
                  </b>{" "}
                  y no se bloquearán (no se cancela a nadie):
                </p>
                <ul className="mt-1 list-disc pl-4">
                  {state.conflicts.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <p className="mt-1">Las otras {state.okCount} sí quedan bloqueadas.</p>
              </div>
            )}

            {state && !needsConfirm && (
              <p className={`text-sm font-medium ${state.ok ? "text-brand-700" : "text-red-700"}`} role={state.ok ? "status" : "alert"}>
                {state.ok ? state.message : "error" in state ? state.error : ""}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              {needsConfirm && "okCount" in state ? (
                <button name="confirm" value="1" className="btn-primary !bg-ink-900" disabled={pending}>
                  {pending ? "Guardando…" : `Bloquear las ${state.okCount}`}
                </button>
              ) : (
                <button className="btn-primary !bg-ink-900" disabled={pending}>
                  {pending ? "Revisando…" : "Bloquear"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
