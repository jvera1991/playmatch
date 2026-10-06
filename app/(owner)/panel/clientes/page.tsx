import Link from "next/link";
import { DashboardShell, StatCard } from "@/components/dashboard-shell";
import { requireOwner } from "@/lib/guards";
import { OWNER_LINKS as LINKS } from "@/lib/owner-links";
import { loadOwnerData, whatsappLink } from "@/lib/owner-data";
import { loadCrm, daysAgoLabel, initials } from "@/lib/owner-crm";
import { SEGMENT_LABEL, type Segment } from "@/lib/owner-metrics";
import { fmtCOP } from "@/components/owner/kpi-widgets";
import { AddCustomerButton } from "@/components/owner/crm-forms";

// Mini-CRM del dueño (06/10/2026): todos los que han reservado sus canchas,
// en línea o por teléfono, con segmento y acceso directo a WhatsApp.

const SEGMENT_STYLE: Record<Segment, string> = {
  frecuente: "bg-brand-100 text-brand-800",
  nuevo: "bg-sky-100 text-sky-800",
  en_riesgo: "bg-amber-100 text-amber-800",
  inactivo: "bg-ink-100 text-ink-600",
  ocasional: "bg-ink-100 text-ink-600",
};

const FILTERS: { k: string; label: string }[] = [
  { k: "", label: "Todos" },
  { k: "frecuente", label: "Frecuentes" },
  { k: "en_riesgo", label: "En riesgo" },
  { k: "nuevo", label: "Nuevos" },
  { k: "inactivo", label: "Inactivos" },
];

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; segmento?: string }>;
}) {
  const { q = "", segmento = "" } = await searchParams;
  const { supabase, user, profile } = await requireOwner("/panel/clientes");

  if (!profile || profile.role !== "owner" || !profile.is_approved_owner) {
    return (
      <DashboardShell title="Panel del dueño" links={LINKS} activeHref="/panel/clientes">
        <div className="card p-8 text-center">
          <p className="text-ink-600">Esta sección es para dueños de cancha aprobados.</p>
        </div>
      </DashboardShell>
    );
  }

  const now = new Date();
  const data = await loadOwnerData(supabase, user.id, new Date(now.getTime() - 365 * 86_400_000));
  const { customers } = await loadCrm(supabase, user.id, data.bookings, now);

  const counts = {
    total: customers.length,
    frecuente: customers.filter((c) => c.segment === "frecuente").length,
    en_riesgo: customers.filter((c) => c.segment === "en_riesgo").length,
    nuevo: customers.filter((c) => c.segment === "nuevo").length,
  };

  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const visible = customers.filter(
    (c) =>
      (!segmento || c.segment === segmento) &&
      (!needle ||
        c.name.toLowerCase().includes(needle) ||
        (digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits)))
  );

  const { data: venueRow } = await supabase.from("venues").select("name").eq("owner_id", user.id).limit(1).maybeSingle();
  const venueName = venueRow?.name ?? "nuestra cancha";

  return (
    <DashboardShell title="Panel del dueño" links={LINKS} activeHref="/panel/clientes">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Clientes</h1>
          <p className="text-ink-500">Todos los que han reservado tus canchas, en línea o por teléfono.</p>
        </div>
        <AddCustomerButton />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Clientes" value={String(counts.total)} />
        <StatCard label="Frecuentes" value={String(counts.frecuente)} hint="3+ partidos en 60 días" />
        <StatCard label="En riesgo" value={String(counts.en_riesgo)} hint="Frecuentes sin volver hace 30+ días" />
        <StatCard label="Nuevos" value={String(counts.nuevo)} hint="Primera reserva en los últimos 30 días" />
      </div>

      <div className="card mt-5 p-5">
        <form className="flex flex-wrap gap-2" role="search">
          <input
            id="crm-q"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre o WhatsApp"
            className="input min-w-[180px] flex-1"
          />
          <select id="crm-seg" name="segmento" defaultValue={segmento} className="input w-auto">
            {FILTERS.map((f) => (
              <option key={f.k} value={f.k}>
                {f.label}
              </option>
            ))}
          </select>
          <button className="btn-secondary">Filtrar</button>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="py-2 font-medium">Cliente</th>
                <th className="py-2 font-medium">Estado</th>
                <th className="py-2 font-medium">Partidos</th>
                <th className="py-2 font-medium">Total pagado</th>
                <th className="py-2 font-medium">Última vez</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 tabular-nums">
              {visible.map((c) => {
                const firstName = c.name.split(" ")[0];
                const msg =
                  c.segment === "en_riesgo" || c.segment === "inactivo"
                    ? `Hola ${firstName}, te extrañamos en ${venueName} ⚽ ¿Te guardo la cancha esta semana?`
                    : `Hola ${firstName}, ¿te guardo la cancha esta semana? ⚽`;
                const wa = whatsappLink(c.phone, msg);
                return (
                  <tr key={c.key}>
                    <td className="py-3">
                      <Link href={`/panel/clientes/${c.key}`} className="flex items-center gap-3 hover:underline">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
                          {initials(c.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-ink-900">{c.name}</span>
                          <span className="block text-xs text-ink-400">
                            {c.origin === "app" ? "Reserva por la app" : "Cliente manual"}
                            {c.tags.length ? ` · ${c.tags.join(", ")}` : ""}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${SEGMENT_STYLE[c.segment]}`}>
                        {SEGMENT_LABEL[c.segment]}
                      </span>
                    </td>
                    <td className="py-3 text-ink-900">{c.played}</td>
                    <td className="py-3 text-ink-900">{fmtCOP(c.totalPaid)}</td>
                    <td className="py-3 text-ink-600">{daysAgoLabel(c.lastPlayedAt, now)}</td>
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
                  <td colSpan={6} className="py-10 text-center text-sm text-ink-400">
                    {customers.length
                      ? "Ningún cliente coincide con ese filtro."
                      : "Aún no tienes clientes. Aparecen solos cuando alguien reserva, o agrégalos con el botón de arriba."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardShell>
  );
}
