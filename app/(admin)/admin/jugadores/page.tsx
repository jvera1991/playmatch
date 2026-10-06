import Link from "next/link";
import { DashboardShell, StatCard } from "@/components/dashboard-shell";
import { requireAdmin } from "@/lib/guards";
import { ADMIN_LINKS as LINKS } from "@/lib/admin-links";
import { loadAdminData } from "@/lib/admin-data";
import { buildPlayers, PLAYER_SEGMENT_LABEL } from "@/lib/admin-metrics";
import { whatsappLink } from "@/lib/owner-data";
import { daysAgoLabel, initials } from "@/lib/owner-crm";
import { fmtCOP } from "@/components/owner/kpi-widgets";
import { SEGMENT_STYLE } from "@/components/admin/admin-ui";

// CRM de jugadores del admin (06/10/2026): todos los registrados en Playmatch,
// con segmento, gasto y acceso directo a WhatsApp.

const PAGE_SIZE = 50;

const FILTERS: { k: string; label: string }[] = [
  { k: "", label: "Todos" },
  { k: "frecuente", label: "Frecuentes" },
  { k: "en_riesgo", label: "En riesgo" },
  { k: "nuevo", label: "Nuevos" },
  { k: "inactivo", label: "Inactivos" },
  { k: "sin_reservar", label: "Sin reservar" },
];

export default async function AdminJugadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; segmento?: string; pagina?: string }>;
}) {
  const { q = "", segmento = "", pagina = "1" } = await searchParams;
  const { supabase, profile } = await requireAdmin("/admin/jugadores");

  if (profile?.role !== "admin") {
    return (
      <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin/jugadores">
        <div className="card p-8 text-center">
          <p className="text-ink-600">Esta sección es solo para administradores de Playmatch.</p>
        </div>
      </DashboardShell>
    );
  }

  const now = new Date();
  const data = await loadAdminData(supabase, new Date(now.getTime() - 365 * 86_400_000));
  const players = buildPlayers(data, now);

  const counts = {
    total: players.length,
    frecuente: players.filter((p) => p.segment === "frecuente").length,
    en_riesgo: players.filter((p) => p.segment === "en_riesgo").length,
    sin_reservar: players.filter((p) => p.segment === "sin_reservar").length,
  };

  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const visible = players.filter(
    (p) =>
      (!segmento || p.segment === segmento) &&
      (!needle || p.name.toLowerCase().includes(needle) || (digits.length >= 3 && (p.phone ?? "").replace(/\D/g, "").includes(digits)))
  );

  const page = Math.max(1, Number.parseInt(pagina, 10) || 1);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const shown = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (segmento) u.set("segmento", segmento);
    if (p > 1) u.set("pagina", String(p));
    const s = u.toString();
    return `/admin/jugadores${s ? `?${s}` : ""}`;
  };
  const exportQs = new URLSearchParams();
  if (q) exportQs.set("q", q);
  if (segmento) exportQs.set("segmento", segmento);

  return (
    <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin/jugadores">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Jugadores</h1>
          <p className="text-ink-500">Todos los que se han registrado en Playmatch.</p>
        </div>
        <a href={`/admin/jugadores/exportar${exportQs.size ? `?${exportQs}` : ""}`} className="btn-secondary">
          ⬇ Exportar CSV
        </a>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Jugadores" value={String(counts.total)} />
        <StatCard label="Frecuentes" value={String(counts.frecuente)} hint="3+ partidos en 60 días" />
        <StatCard label="En riesgo" value={String(counts.en_riesgo)} hint="Frecuentes sin volver hace 30+ días" />
        <StatCard label="Sin reservar" value={String(counts.sin_reservar)} hint="Registrados que nunca han jugado" />
      </div>

      <div className="card mt-5 p-5">
        <form className="flex flex-wrap gap-2" role="search">
          <input
            id="adm-q"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre o WhatsApp"
            className="input min-w-[180px] flex-1"
          />
          <select id="adm-seg" name="segmento" defaultValue={segmento} className="input w-auto">
            {FILTERS.map((f) => (
              <option key={f.k} value={f.k}>
                {f.label}
              </option>
            ))}
          </select>
          <button className="btn-secondary">Filtrar</button>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="py-2 font-medium">Jugador</th>
                <th className="py-2 font-medium">Estado</th>
                <th className="py-2 font-medium">Partidos</th>
                <th className="py-2 font-medium">Total pagado</th>
                <th className="py-2 font-medium">Deporte / zona</th>
                <th className="py-2 font-medium">Última vez</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 tabular-nums">
              {shown.map((p) => {
                const first = p.name.split(" ")[0];
                const msg =
                  p.segment === "en_riesgo" || p.segment === "inactivo"
                    ? `Hola ${first}, te extrañamos en Playmatch ⚽ ¿Te animas a reservar esta semana?`
                    : p.segment === "sin_reservar"
                      ? `Hola ${first}, ¡bienvenido a Playmatch! ¿Te ayudo a encontrar una cancha?`
                      : `Hola ${first}, te escribimos de Playmatch ⚽`;
                const wa = whatsappLink(p.phone, msg);
                return (
                  <tr key={p.id}>
                    <td className="py-3">
                      <Link href={`/admin/jugadores/${p.id}`} className="flex items-center gap-3 hover:underline">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
                          {initials(p.name)}
                        </span>
                        <span className="font-semibold text-ink-900">{p.name}</span>
                      </Link>
                    </td>
                    <td className="py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${SEGMENT_STYLE[p.segment]}`}>
                        {PLAYER_SEGMENT_LABEL[p.segment]}
                      </span>
                    </td>
                    <td className="py-3 text-ink-900">{p.played}</td>
                    <td className="py-3 text-ink-900">{fmtCOP(p.totalPaid)}</td>
                    <td className="py-3 text-ink-600">{p.sport ? `${p.sport}${p.zone ? ` · ${p.zone}` : ""}` : "—"}</td>
                    <td className="py-3 text-ink-600">
                      {p.lastPlayedAt ? daysAgoLabel(p.lastPlayedAt, now) : `Registrado ${daysAgoLabel(p.createdAt, now).toLowerCase()}`}
                    </td>
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
              {!shown.length && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-ink-400">
                    {players.length ? "Ningún jugador coincide con ese filtro." : "Aún no hay jugadores registrados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-ink-600">
            <span>
              Página {page} de {pages} · {visible.length} jugadores
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={qs(page - 1)} className="btn-secondary !px-3 !py-1.5">
                  ← Anterior
                </Link>
              )}
              {page < pages && (
                <Link href={qs(page + 1)} className="btn-secondary !px-3 !py-1.5">
                  Siguiente →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
