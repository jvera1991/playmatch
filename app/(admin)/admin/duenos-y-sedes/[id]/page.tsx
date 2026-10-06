import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell, StatCard } from "@/components/dashboard-shell";
import { requireAdmin } from "@/lib/guards";
import { ADMIN_LINKS as LINKS } from "@/lib/admin-links";
import { loadAdminData } from "@/lib/admin-data";
import { buildOwners, OWNER_HEALTH_LABEL } from "@/lib/admin-metrics";
import { whatsappLink } from "@/lib/owner-data";
import { daysAgoLabel, initials } from "@/lib/owner-crm";
import { fmtCOP, fmtPct } from "@/components/owner/kpi-widgets";
import { HEALTH_STYLE } from "@/components/admin/admin-ui";
import { AdminNotesForm } from "@/components/admin/admin-notes-form";

export default async function AdminDuenoFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, profile } = await requireAdmin(`/admin/duenos-y-sedes/${id}`);
  if (profile?.role !== "admin") notFound();

  const now = new Date();
  const data = await loadAdminData(supabase, new Date(now.getTime() - 365 * 86_400_000));
  const o = buildOwners(data, now).find((x) => x.id === id);
  if (!o) notFound();

  const { data: note } = await supabase.from("admin_notes").select("notes, tags").eq("profile_id", id).maybeSingle();
  const title = o.venueNames[0] ?? o.name;
  const first = o.name.split(" ")[0];
  const wa = whatsappLink(
    o.phone,
    `Hola ${first}, te escribimos de Playmatch. Queremos ayudarte a conseguir más reservas en tu cancha, ¿hablamos?`
  );

  return (
    <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin/duenos-y-sedes">
      <Link href="/admin/duenos-y-sedes" className="text-sm font-medium text-brand-700 hover:underline">
        ← Dueños y sedes
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-base font-bold text-brand-800">
            {initials(title)}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-ink-900">{title}</h1>
            <p className="text-sm text-ink-500">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${HEALTH_STYLE[o.health]}`}>
                {OWNER_HEALTH_LABEL[o.health]}
              </span>{" "}
              Dueño: {o.name}
              {o.phone ? ` · ${o.phone}` : ""} · Se registró {daysAgoLabel(o.createdAt, now).toLowerCase()}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-primary">
              Escribir por WhatsApp
            </a>
          )}
          <Link href="/admin/canchas" className="btn-secondary">
            Ver canchas
          </Link>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Reservas 30 días" value={String(o.played30)} />
        <StatCard label="Volumen 30 días" value={fmtCOP(o.gmv30)} hint={`Comisión ${fmtCOP(o.commission30)}`} />
        <StatCard label="Ocupación" value={fmtPct(o.occupancy30)} />
        <StatCard label="Cancelaciones" value={fmtPct(o.cancelRate30)} hint={`Última reserva: ${daysAgoLabel(o.lastPlayedAt, now).toLowerCase()}`} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          {!!o.hints.length && (
            <div className="card border-amber-200 bg-amber-50 p-5">
              <h2 className="font-semibold text-amber-900">Posibles causas</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-amber-900">
                {o.hints.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="card p-5">
            <h2 className="font-semibold text-ink-900">Canchas</h2>
            <ul className="mt-2 divide-y divide-ink-100 text-sm">
              {o.courts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="text-ink-700">
                    {c.name} · {c.sport} · {fmtCOP(c.price)}/h
                  </span>
                  <span className="flex gap-1.5 text-xs font-bold">
                    {!c.approved && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Sin aprobar</span>}
                    {!c.active && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-ink-600">Pausada</span>}
                    {!c.photos && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-ink-600">Sin fotos</span>}
                  </span>
                </li>
              ))}
              {!o.courts.length && <li className="py-6 text-center text-ink-400">Aún no ha publicado canchas.</li>}
            </ul>
          </div>
        </div>
        <div className="card self-start p-5">
          <h2 className="font-semibold text-ink-900">Notas internas de Playmatch</h2>
          <div className="mt-3">
            <AdminNotesForm profileId={id} kind="duenos-y-sedes" notes={note?.notes ?? ""} tags={(note?.tags as string[] | null) ?? []} />
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
