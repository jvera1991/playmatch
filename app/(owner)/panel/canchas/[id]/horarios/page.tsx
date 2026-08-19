import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireOwner } from "@/lib/guards";
import { OWNER_LINKS as LINKS } from "@/lib/owner-links";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// Colombia es UTC-5 fijo (sin horario de verano) — mismo criterio que
// lib/availability.ts y /panel/calendario.
const BOGOTA_OFFSET_HOURS = -5;

// El <input type="datetime-local"> devuelve "YYYY-MM-DDTHH:mm" SIN zona
// horaria. Antes se guardaba ese texto tal cual en una columna `timestamptz`
// — Postgres lo interpretaba como UTC (no como hora de Bogotá), así que una
// franja bloqueada de "9:00 a 11:00 a.m." terminaba guardada 5 horas antes
// de lo que el dueño quería, y se veía distinto en el calendario. Esta
// función convierte esa hora, asumiendo que es hora de Bogotá, al UTC
// correcto antes de guardarla.
function bogotaLocalToUtcIso(local: string): string {
  const [datePart, timePart] = local.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const utcMs = Date.UTC(y, m - 1, d, hh - BOGOTA_OFFSET_HOURS, mm);
  return new Date(utcMs).toISOString();
}

// Aquí el dueño define su horario semanal recurrente (abre/cierra) y puede
// cerrar puntualmente una fecha/hora específica (mantenimiento, evento privado, etc.)
export default async function HorariosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courtId } = await params;
  const { supabase } = await requireOwner(`/panel/canchas/${courtId}/horarios`);

  const { data: court } = await supabase.from("courts").select("name").eq("id", courtId).single();

  const { data: schedules } = await supabase
    .from("court_schedules")
    .select("*")
    .eq("court_id", courtId)
    .order("day_of_week");

  const { data: closures } = await supabase
    .from("court_closures")
    .select("*")
    .eq("court_id", courtId)
    .gte("end_at", new Date().toISOString())
    .order("start_at");

  async function guardarHorario(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const open_time = String(formData.get("open_time"));
    const close_time = String(formData.get("close_time"));
    const aplicarATodos = formData.get("aplicar_todos") === "on";
    const dias = aplicarATodos
      ? [0, 1, 2, 3, 4, 5, 6]
      : [Number(formData.get("day_of_week"))];

    for (const day_of_week of dias) {
      await supabase.from("court_schedules").delete().eq("court_id", courtId).eq("day_of_week", day_of_week);
      await supabase.from("court_schedules").insert({ court_id: courtId, day_of_week, open_time, close_time });
    }
    redirect(`/panel/canchas/${courtId}/horarios`);
  }

  async function eliminarHorario(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const day_of_week = Number(formData.get("day_of_week"));
    await supabase.from("court_schedules").delete().eq("court_id", courtId).eq("day_of_week", day_of_week);
    redirect(`/panel/canchas/${courtId}/horarios`);
  }

  async function cerrarFranja(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("court_closures").insert({
      court_id: courtId,
      start_at: bogotaLocalToUtcIso(String(formData.get("start_at"))),
      end_at: bogotaLocalToUtcIso(String(formData.get("end_at"))),
      reason: String(formData.get("reason") || "Bloqueado por el dueño"),
      created_by: user?.id,
    });
    redirect(`/panel/canchas/${courtId}/horarios`);
  }

  return (
    <DashboardShell title="Panel del dueño" links={LINKS} activeHref="/panel/canchas">
      <h1 className="text-2xl font-bold text-ink-900">Horarios — {court?.name}</h1>

      <section className="card mt-5 p-6">
        <h2 className="font-semibold text-ink-900">Horario semanal</h2>
        <p className="text-sm text-ink-500">
          Aquí defines a qué hora abre y a qué hora cierra tu cancha cada día. Los jugadores
          solo van a poder reservar dentro de ese rango — por ejemplo, si eliges{" "}
          <strong>Lunes</strong>, hora de apertura <strong>6:00 a. m.</strong> y hora de cierre{" "}
          <strong>10:00 p. m.</strong>, un jugador podrá reservar cualquier hora entre esas dos,
          los lunes.
        </p>

        <form action={guardarHorario} className="mt-4 space-y-3 rounded-xl border border-ink-100 bg-ink-50/50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-ink-500">1. Elige el día</label>
              <select name="day_of_week" required className="input mt-1">
                {DIAS.map((d, i) => (
                  <option key={i} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-500">2. Hora de apertura</label>
              <input type="time" name="open_time" required className="input mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-500">3. Hora de cierre</label>
              <input type="time" name="close_time" required className="input mt-1" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-600">
            <input type="checkbox" name="aplicar_todos" className="h-4 w-4 rounded border-ink-300" />
            Usar el mismo horario los 7 días de la semana
          </label>

          <button className="btn-primary w-full sm:w-auto">Guardar horario</button>
        </form>

        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-400">
          Horarios ya guardados
        </p>
        <ul className="mt-2 divide-y divide-ink-100 rounded-xl border border-ink-100">
          {schedules?.map((s) => (
            <li key={s.id} className="flex items-center justify-between p-3 text-sm">
              <span className="font-medium text-ink-700">{DIAS[s.day_of_week]}</span>
              <span className="flex items-center gap-3">
                <span className="text-ink-500">
                  {s.open_time.slice(0, 5)} – {s.close_time.slice(0, 5)}
                </span>
                <form action={eliminarHorario}>
                  <input type="hidden" name="day_of_week" value={s.day_of_week} />
                  <button className="text-xs font-medium text-red-600 hover:underline">Quitar</button>
                </form>
              </span>
            </li>
          ))}
          {!schedules?.length && (
            <li className="p-4 text-center text-sm text-ink-400">
              Aún no has definido horarios — usa el formulario de arriba para agregar el primero.
            </li>
          )}
        </ul>
      </section>

      <section className="card mt-5 p-6">
        <h2 className="font-semibold text-ink-900">Cerrar una franja puntual</h2>
        <p className="text-sm text-ink-500">
          Úsalo para bloquear la cancha en una fecha/hora específica (mantenimiento, torneo
          privado, día festivo).
        </p>
        <form action={cerrarFranja} className="mt-4 space-y-3 rounded-xl border border-ink-100 bg-ink-50/50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-ink-500">Desde</label>
              <input type="datetime-local" name="start_at" required className="input mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-500">Hasta</label>
              <input type="datetime-local" name="end_at" required className="input mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-500">Motivo (opcional)</label>
            <input name="reason" placeholder="Ej. Vacaciones, mantenimiento, torneo privado" className="input mt-1" />
          </div>
          <button className="btn-secondary w-full sm:w-auto">Bloquear esta franja</button>
        </form>

        <ul className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-100">
          {closures?.map((c) => (
            <li key={c.id} className="p-3 text-sm text-ink-700">
              {new Date(c.start_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })} —{" "}
              {new Date(c.end_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}
              {c.reason ? ` · ${c.reason}` : ""}
            </li>
          ))}
          {!closures?.length && (
            <li className="p-4 text-center text-sm text-ink-400">
              No tienes franjas cerradas próximas.
            </li>
          )}
        </ul>
      </section>
    </DashboardShell>
  );
}
