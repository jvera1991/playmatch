"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Bloqueo de agenda desde el calendario (06/10/2026): escuelas de fútbol,
// eventos privados, torneos, mantenimiento. Cada franja se guarda como una
// fila normal de court_closures (las respeta toda la app sin cambios). Una
// serie semanal comparte series_id por cancha. Si una franja choca con una
// reserva vigente, esa franja se SALTA (no se cancela a nadie) y se avisa.
// La RLS closures_owner_write garantiza que solo el dueño escribe/borra.

const CATEGORIES = ["escuela", "evento", "torneo", "mantenimiento", "otro"] as const;
const MAX_DAYS = 183; // una serie dura como máximo ~6 meses
const MAX_ROWS = 600;
const DAY_MS = 86_400_000;

const schema = z
  .object({
    court: z.string().refine((v) => v === "all" || z.string().uuid().safeParse(v).success, "Elige una cancha."),
    category: z.enum(CATEGORIES, { message: "Elige el motivo." }),
    note: z.string().trim().max(200, "La nota es muy larga.").optional(),
    mode: z.enum(["once", "weekly"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige la fecha."),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    from: z.string().regex(/^\d{2}:\d{2}$/, "Elige la hora de inicio."),
    to: z.string().regex(/^\d{2}:\d{2}$/, "Elige la hora final."),
    days: z.array(z.coerce.number().int().min(0).max(6)),
    confirm: z.string().optional(),
  })
  .refine((v) => toMin(v.to) > toMin(v.from), { message: "La hora final debe ser después de la de inicio." })
  .refine((v) => v.mode === "once" || v.days.length > 0, { message: "Elige al menos un día de la semana." })
  .refine((v) => v.mode === "once" || !!v.until, { message: "Elige hasta qué fecha se repite." });

export type BlockResult =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | { ok: false; needsConfirm: true; conflicts: string[]; okCount: number };

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
// Fecha (YYYY-MM-DD) a medianoche UTC, para iterar días sin líos de zona
function dayUtc(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
// Hora de Colombia (UTC-5 fijo) -> instante UTC
const bogota = (dayMs: number, minutes: number) => new Date(dayMs + (minutes + 300) * 60_000);
const todayBogotaMs = () => dayUtc(new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10));

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function label(iso: string) {
  const d = new Date(new Date(iso).getTime() - 5 * 3600_000);
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]} · ${h12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h >= 12 ? "p.m." : "a.m."}`;
}

export async function createBlock(_prev: BlockResult | null, formData: FormData): Promise<BlockResult> {
  const parsed = schema.safeParse({
    court: formData.get("court"),
    category: formData.get("category"),
    note: formData.get("note") || undefined,
    mode: formData.get("mode"),
    date: formData.get("date"),
    until: formData.get("until") || "",
    from: formData.get("from"),
    to: formData.get("to"),
    days: formData.getAll("days"),
    confirm: formData.get("confirm") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a ingresar." };

  // Canchas del dueño (la RLS de escritura igual lo exige; esto evita filas a medias)
  const { data: courts } = await supabase
    .from("courts")
    .select("id, name, venues!inner(owner_id)")
    .eq("venues.owner_id", user.id);
  const ownCourts = (courts ?? []).filter((c) => v.court === "all" || c.id === v.court);
  if (!ownCourts.length) return { ok: false, error: "Esa cancha no es tuya." };

  // Fechas de la(s) franja(s)
  const first = dayUtc(v.date);
  if (first < todayBogotaMs()) return { ok: false, error: "No puedes bloquear días que ya pasaron." };
  const last = v.mode === "once" ? first : dayUtc(v.until!);
  if (last < first) return { ok: false, error: "La fecha final debe ser después de la inicial." };
  if ((last - first) / DAY_MS > MAX_DAYS) return { ok: false, error: "Una serie puede durar máximo 6 meses." };

  const fromMin = toMin(v.from);
  const toMinutes = toMin(v.to);
  const dayList: number[] = [];
  for (let d = first; d <= last; d += DAY_MS) {
    if (v.mode === "once" || v.days.includes(new Date(d).getUTCDay())) dayList.push(d);
  }
  if (!dayList.length) return { ok: false, error: "Ninguna fecha del rango cae en los días elegidos." };
  if (dayList.length * ownCourts.length > MAX_ROWS) return { ok: false, error: "Son demasiadas franjas; acorta el rango." };

  // Reservas vigentes que chocan -> esas franjas se saltan
  const rangeStart = bogota(dayList[0], fromMin).toISOString();
  const rangeEnd = bogota(dayList[dayList.length - 1], toMinutes).toISOString();
  const { data: bookings } = await supabase
    .from("bookings")
    .select("court_id, start_at, end_at, source, profiles:player_id(full_name), owner_customers:customer_id(full_name)")
    .in("court_id", ownCourts.map((c) => c.id))
    .in("status", ["pending_payment", "confirmed"])
    .lt("start_at", rangeEnd)
    .gt("end_at", rangeStart);

  const courtName = new Map(ownCourts.map((c) => [c.id, c.name as string]));
  const rows: Record<string, unknown>[] = [];
  const conflicts: string[] = [];
  const reason = v.note?.trim() || null;

  for (const court of ownCourts) {
    const seriesId = v.mode === "weekly" ? randomUUID() : null;
    for (const d of dayList) {
      const s = bogota(d, fromMin);
      const e = bogota(d, toMinutes);
      const hit = (bookings ?? []).find(
        (b) => b.court_id === court.id && new Date(b.start_at) < e && new Date(b.end_at) > s
      );
      if (hit) {
        const who =
          hit.source === "manual"
            ? `${(hit.owner_customers as unknown as { full_name: string } | null)?.full_name ?? "Cliente"} (manual)`
            : `${(hit.profiles as unknown as { full_name: string | null } | null)?.full_name ?? "Jugador"} (en línea)`;
        conflicts.push(`${label(hit.start_at)} · ${who}${ownCourts.length > 1 ? ` · ${courtName.get(court.id)}` : ""}`);
        continue;
      }
      if (s.getTime() <= Date.now()) continue; // franja de hoy que ya pasó
      rows.push({
        court_id: court.id,
        start_at: s.toISOString(),
        end_at: e.toISOString(),
        reason,
        category: v.category,
        series_id: seriesId,
        created_by: user.id,
      });
    }
  }

  if (!rows.length) {
    return { ok: false, error: conflicts.length ? "Todas esas franjas ya tienen reservas; no se bloqueó nada." : "No quedó ninguna franja por bloquear." };
  }
  if (conflicts.length && v.confirm !== "1") {
    return { ok: false, needsConfirm: true, conflicts: conflicts.slice(0, 8), okCount: rows.length };
  }

  const { error } = await supabase.from("court_closures").insert(rows);
  if (error) {
    console.error("createBlock", error.message);
    return { ok: false, error: "No se pudo guardar el bloqueo. Intenta de nuevo." };
  }

  revalidatePath("/panel/calendario");
  revalidatePath("/panel");
  const n = rows.length;
  return {
    ok: true,
    message: `Listo: ${n} ${n === 1 ? "franja bloqueada" : "franjas bloqueadas"}${conflicts.length ? ` (${conflicts.length} saltadas por reservas)` : ""}.`,
  };
}

const removeSchema = z.object({
  closure_id: z.string().uuid(),
  scope: z.enum(["one", "following"]),
});

export async function removeBlock(formData: FormData): Promise<void> {
  const parsed = removeSchema.safeParse({ closure_id: formData.get("closure_id"), scope: formData.get("scope") });
  if (!parsed.success) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { closure_id, scope } = parsed.data;
  const { data: row } = await supabase
    .from("court_closures")
    .select("id, court_id, start_at, series_id")
    .eq("id", closure_id)
    .maybeSingle();
  if (!row) return;

  // La RLS (closures_owner_write) hace que esto borre 0 filas si no es su cancha
  if (scope === "following" && row.series_id) {
    await supabase
      .from("court_closures")
      .delete()
      .eq("series_id", row.series_id)
      .eq("court_id", row.court_id)
      .gte("start_at", row.start_at);
  } else {
    await supabase.from("court_closures").delete().eq("id", row.id);
  }
  revalidatePath("/panel/calendario");
}
