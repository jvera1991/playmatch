import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell, StatCard } from "@/components/dashboard-shell";
import { requireAdmin } from "@/lib/guards";
import { ADMIN_LINKS as LINKS } from "@/lib/admin-links";
import { loadAdminData } from "@/lib/admin-data";
import { buildPlayers, PLAYER_SEGMENT_LABEL } from "@/lib/admin-metrics";
import { whatsappLink } from "@/lib/owner-data";
import { daysAgoLabel, initials } from "@/lib/owner-crm";
import { BOGOTA_OFFSET_MS } from "@/lib/owner-metrics";
import { fmtCOP } from "@/components/owner/kpi-widgets";
import { SEGMENT_STYLE } from "@/components/admin/admin-ui";
import { AdminNotesForm } from "@/components/admin/admin-notes-form";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// Hora de Bogotá calculada a mano: mismo texto en servidor y navegador
function fechaCorta(iso: string) {
  const d = new Date(new Date(iso).getTime() + BOGOTA_OFFSET_MS);
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]} · ${h12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h >= 12 ? "p.m." : "a.m."}`;
}

export default async function AdminJugadorFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, profile } = await requireAdmin(`/admin/jugadores/${id}`);
  if (profile?.role !== "admin") notFound();

  const now = new Date();
  const data = await loadAdminData(supabase, new Date(now.getTime() - 365 * 86_400_000));
  const p = buildPlayers(data, now).find((x) => x.id === id);
  if (!p) notFound();

  const { data: note } = await supabase.from("admin_notes").select("notes, tags").eq("profile_id", id).maybeSingle();

  const courtName = new Map(data.courts.map((c) => [c.id, c.name]));
  const history = data.bookings
    .filter((b) => b.source === "online" && b.player_id === id)
    .sort((a, b) => b.start_at.localeCompare(a.start_at));

  const first = p.name.split(" ")[0];
  const wa = whatsappLink(p.phone, `Hola ${first}, te escribimos de Playmatch ⚽`);

  const statusOf = (b: (typeof history)[number]) => {
    if (b.status === "cancelled") {
      return {
        label: b.cancelled_by ? `Cancelada${b.cancellation_reason ? ` · ${b.cancellation_reason}` : ""}` : "No pagó a tiempo",
        cls: "bg-ink-100 text-ink-600",
      };
    }
    if (b.status === "pending_payment") return { label: "Esperando pago", cls: "bg-amber-100 text-amber-800" };
    if (new Date(b.start_at) > now) return { label: "Próxima", cls: "bg-sky-100 text-sky-800" };
    return { label: "Jugada", cls: "bg-brand-100 text-brand-800" };
  };

  return (
    <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin/jugadores">
      <Link href="/admin/jugadores" className="text-sm font-medium text-brand-700 hover:underline">
        ← Jugadores
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-base font-bold text-brand-800">
            {initials(p.name)}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-ink-900">{p.name}</h1>
            <p className="text-sm text-ink-500">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${SEGMENT_STYLE[p.segment]}`}>
                {PLAYER_SEGMENT_LABEL[p.segment]}
              </span>
              {p.phone ? ` · ${p.phone}` : ""} · Registrado {daysAgoLabel(p.createdAt, now).toLowerCase()}
            </p>
          </div>
        </div>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-primary">
            Escribir por WhatsApp
          </a>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Partidos jugados" value={String(p.played)} />
        <StatCard label="Total pagado" value={fmtCOP(p.totalPaid)} />
        <StatCard label="Cancelaciones" value={String(p.cancelled)} />
        <StatCard label="Última vez" value={daysAgoLabel(p.lastPlayedAt, now)} hint={p.sport ? `${p.sport}${p.zone ? ` · ${p.zone}` : ""}` : undefined} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="card p-5">
            <h2 className="font-semibold text-ink-900">Historial</h2>
            <ul className="mt-2 divide-y divide-ink-100 text-sm">
              {history.map((b) => {
                const st = statusOf(b);
                return (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="text-ink-700">
                      {fechaCorta(b.start_at)} · {courtName.get(b.court_id) ?? "Cancha"} · {fmtCOP(b.total_price)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
                  </li>
                );
              })}
              {!history.length && <li className="py-6 text-center text-ink-400">Aún no tiene reservas.</li>}
            </ul>
          </div>
          {!!p.courtsPlayed.length && (
            <div className="card p-5">
              <h2 className="font-semibold text-ink-900">Canchas donde juega</h2>
              <ul className="mt-2 divide-y divide-ink-100 text-sm">
                {p.courtsPlayed.slice(0, 6).map((c) => (
                  <li key={c.name} className="flex justify-between py-2">
                    <span className="text-ink-700">{c.name}</span>
                    <span className="tabular-nums text-ink-900">{c.n} partido{c.n > 1 ? "s" : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="card self-start p-5">
          <h2 className="font-semibold text-ink-900">Notas internas de Playmatch</h2>
          <div className="mt-3">
            <AdminNotesForm profileId={id} kind="jugadores" notes={note?.notes ?? ""} tags={(note?.tags as string[] | null) ?? []} />
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
