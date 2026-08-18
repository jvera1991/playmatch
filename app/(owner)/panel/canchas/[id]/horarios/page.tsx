import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireOwner } from "@/lib/guards";
import { OWNER_LINKS as LINKS } from "@/lib/owner-links";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

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
    const day_of_week = Number(formData.get("day_of_week"));
    const open_time = String(formData.get("open_time"));
    const close_time = String(formData.get("close_time"));

    await supabase.from("court_schedules").delete().eq("court_id", courtId).eq("day_of_week", day_of_week);
    await supabase.from("court_schedules").insert({ court_id: courtId, day_of_week, open_time, close_time });
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
      start_at: String(formData.get("start_at")),
      end_at: String(formData.get("end_at")),
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
          Define a qué hora abre y cierra esta cancha cada día. Los jugadores solo podrán
          reservar dentro de este rango.
        </p>
        <form action={guardarHorario} className="mt-4 flex flex-wrap items-end gap-2">
          <select name="day_of_week" required className="input w-auto">
            {DIAS.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
          <input type="time" name="open_time" required className="input w-auto" />
          <span className="text-ink-400">a</span>
          <input type="time" name="close_time" required className="input w-auto" />
          <button className="btn-primary">Guardar</button>
        </form>

        <ul className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-100">
          {schedules?.map((s) => (
            <li key={s.id} className="flex justify-between p-3 text-sm">
              <span className="font-medium text-ink-700">{DIAS[s.day_of_week]}</span>
              <span className="text-ink-500">
                {s.open_time} – {s.close_time}
              </span>
            </li>
          ))}
          {!schedules?.length && (
            <li className="p-4 text-center text-sm text-ink-400">Aún no has definido horarios.</li>
          )}
        </ul>
      </section>

      <section className="card mt-5 p-6">
        <h2 className="font-semibold text-ink-900">Cerrar una franja puntual</h2>
        <p className="text-sm text-ink-500">
          Úsalo para bloquear la cancha en una fecha/hora específica (mantenimiento, torneo
          privado, día festivo).
        </p>
        <form action={cerrarFranja} className="mt-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input type="datetime-local" name="start_at" required className="input" />
            <input type="datetime-local" name="end_at" required className="input" />
          </div>
          <input name="reason" placeholder="Motivo (opcional)" className="input" />
          <button className="btn-secondary">Cerrar franja</button>
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
