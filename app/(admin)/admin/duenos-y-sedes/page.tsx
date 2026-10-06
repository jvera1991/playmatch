import Link from "next/link";
import { DashboardShell, StatCard } from "@/components/dashboard-shell";
import { requireAdmin } from "@/lib/guards";
import { ADMIN_LINKS as LINKS } from "@/lib/admin-links";
import { loadAdminData } from "@/lib/admin-data";
import { buildOwners, OWNER_HEALTH_LABEL } from "@/lib/admin-metrics";
import { whatsappLink } from "@/lib/owner-data";
import { daysAgoLabel, initials } from "@/lib/owner-crm";
import { fmtCOP, fmtPct } from "@/components/owner/kpi-widgets";
import { HEALTH_STYLE } from "@/components/admin/admin-ui";

// CRM de dueños (06/10/2026): qué tan bien le va a cada dueño en Playmatch,
// para saber a quién ayudar. Últimos 30 días.

const FILTERS = [
  { k: "", label: "Todos" },
  { k: "activo", label: "Activos" },
  { k: "en_riesgo", label: "En riesgo" },
  { k: "dormido", label: "Dormidos" },
  { k: "nuevo", label: "Nuevos" },
];

export default async function AdminDuenosYSedesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; salud?: string }>;
}) {
  const { q = "", salud = "" } = await searchParams;
  const { supabase, profile } = await requireAdmin("/admin/duenos-y-sedes");

  if (profile?.role !== "admin") {
    return (
      <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin/duenos-y-sedes">
        <div className="card p-8 text-center">
          <p className="text-ink-600">Esta sección es solo para administradores de Playmatch.</p>
        </div>
      </DashboardShell>
    );
  }

  const now = new Date();
  const data = await loadAdminData(supabase, new Date(now.getTime() - 365 * 86_400_000));
  const owners = buildOwners(data, now);
  const count = (h: string) => owners.filter((o) => o.health === h).length;

  const needle = q.trim().toLowerCase();
  const visible = owners.filter(
    (o) =>
      (!salud || o.health === salud) &&
      (!needle || o.name.toLowerCase().includes(needle) || o.venueNames.some((v) => v.toLowerCase().includes(needle)))
  );

  return (
    <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin/duenos-y-sedes">
      <h1 className="text-2xl font-bold text-ink-900">Dueños y sedes</h1>
      <p className="text-ink-500">
        Cómo le va a cada dueño en los últimos 30 días, para saber a quién ayudar. Los pendientes de aprobación están en{" "}
        <Link href="/admin/duenos" className="font-medium text-brand-700 hover:underline">
          Dueños pendientes
        </Link>
        .
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Dueños aprobados" value={String(owners.length)} />
        <StatCard label="Activos" value={String(count("activo"))} hint="Con reservas y poca cancelación" />
        <StatCard label="En riesgo" value={String(count("en_riesgo"))} hint="Bajaron o cancelan mucho" />
        <StatCard label="Dormidos" value={String(count("dormido"))} hint="Sin reservas en 30 días" />
      </div>

      <div className="card mt-5 p-5">
        <form className="flex flex-wrap gap-2" role="search">
          <input
            id="own-q"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por dueño o sede"
            className="input min-w-[180px] flex-1"
          />
          <select id="own-salud" name="salud" defaultValue={salud} className="input w-auto">
            {FILTERS.map((f) => (
              <option key={f.k} value={f.k}>
                {f.label}
              </option>
            ))}
          </select>
          <button className="btn-secondary">Filtrar</button>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="py-2 font-medium">Dueño / sede</th>
                <th className="py-2 font-medium">Salud</th>
                <th className="py-2 font-medium">Canchas</th>
                <th className="py-2 font-medium">Reservas 30d</th>
                <th className="py-2 font-medium">Ocupación</th>
                <th className="py-2 font-medium">Comisión 30d</th>
                <th className="py-2 font-medium">Cancelaciones</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 tabular-nums">
              {visible.map((o) => {
                const first = o.name.split(" ")[0];
                const wa = whatsappLink(
                  o.phone,
                  o.health === "activo"
                    ? `Hola ${first}, te escribimos de Playmatch ⚽`
                    : `Hola ${first}, te escribimos de Playmatch. Queremos ayudarte a conseguir más reservas en tu cancha, ¿hablamos?`
                );
                return (
                  <tr key={o.id}>
                    <td className="py-3">
                      <Link href={`/admin/duenos-y-sedes/${o.id}`} className="flex items-center gap-3 hover:underline">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
                          {initials(o.venueNames[0] ?? o.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-ink-900">{o.venueNames[0] ?? o.name}</span>
                          <span className="block text-xs text-ink-400">{o.name}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${HEALTH_STYLE[o.health]}`}>
                        {OWNER_HEALTH_LABEL[o.health]}
                      </span>
                    </td>
                    <td className="py-3 text-ink-900">{o.courts.length}</td>
                    <td className="py-3 text-ink-900">{o.played30}</td>
                    <td className="py-3 text-ink-900">{fmtPct(o.occupancy30)}</td>
                    <td className="py-3 text-ink-900">{fmtCOP(o.commission30)}</td>
                    <td className="py-3 text-ink-600">{fmtPct(o.cancelRate30)}</td>
                    <td className="py-3 text-right">
                      {wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="whitespace-nowrap rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700 hover:bg-brand-100"
                        >
                          WhatsApp
                        </a>
                      ) : (
                        <span className="text-xs text-ink-400">Sin número</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!visible.length && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-ink-400">
                    {owners.length ? "Ningún dueño coincide con ese filtro." : "Aún no hay dueños aprobados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-400">
          Salud: <b>activo</b> (reservas y poca cancelación) · <b>en riesgo</b> (bajó a menos de la mitad o cancela más del 15%) ·{" "}
          <b>dormido</b> (0 reservas en 30 días) · <b>nuevo</b> (se registró hace menos de 30 días). Última reserva jugada de cualquiera:{" "}
          {daysAgoLabel(owners.map((o) => o.lastPlayedAt).filter(Boolean).sort().pop() ?? null, now).toLowerCase()}.
        </p>
      </div>
    </DashboardShell>
  );
}
