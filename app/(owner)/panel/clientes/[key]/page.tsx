import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell, StatCard } from "@/components/dashboard-shell";
import { requireOwner } from "@/lib/guards";
import { OWNER_LINKS as LINKS } from "@/lib/owner-links";
import { loadOwnerData, whatsappLink } from "@/lib/owner-data";
import { loadCrm, daysAgoLabel, initials } from "@/lib/owner-crm";
import { customerKey, SEGMENT_LABEL, BOGOTA_OFFSET_MS } from "@/lib/owner-metrics";
import { fmtCOP } from "@/components/owner/kpi-widgets";
import { CustomerNotesForm } from "@/components/owner/crm-forms";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Fecha corta en hora de Bogotá, calculada a mano (igual que el calendario)
// para que servidor y navegador muestren exactamente el mismo texto.
function fechaCorta(iso: string) {
  const d = new Date(new Date(iso).getTime() + BOGOTA_OFFSET_MS);
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]} · ${h12}:${m} ${h >= 12 ? "p.m." : "a.m."}`;
}

export default async function ClienteFichaPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[cp]-[0-9a-f-]{36}$/.test(key)) notFound();

  const { supabase, user, profile } = await requireOwner(`/panel/clientes/${key}`);
  if (!profile || profile.role !== "owner" || !profile.is_approved_owner) notFound();

  const now = new Date();
  const data = await loadOwnerData(supabase, user.id, new Date(now.getTime() - 365 * 86_400_000));
  const { customers, unifiedBookings } = await loadCrm(supabase, user.id, data.bookings, now);
  const c = customers.find((x) => x.key === key);
  if (!c) notFound();

  const courtName = new Map(data.courts.map((x) => [x.id, x.name]));
  const history = unifiedBookings
    .filter((b) => customerKey(b) === key)
    .sort((a, b) => b.start_at.localeCompare(a.start_at));

  const firstName = c.name.split(" ")[0];
  const wa = whatsappLink(c.phone, `Hola ${firstName}, ¿te guardo la cancha esta semana? ⚽`);

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
    <DashboardShell title="Panel del dueño" links={LINKS} activeHref="/panel/clientes">
      <Link href="/panel/clientes" className="text-sm font-medium text-brand-700 hover:underline">
        ← Clientes
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-base font-bold text-brand-800">
            {initials(c.name)}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-ink-900">{c.name}</h1>
            <p className="text-sm text-ink-500">
              {SEGMENT_LABEL[c.segment]} · {c.origin === "app" ? "Reserva por la app" : "Cliente manual"}
              {c.phone ? ` · ${c.phone}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              Escribir por WhatsApp
            </a>
          )}
          <Link href="/panel/calendario?nueva=1" className="btn-primary">
            + Reservarle
          </Link>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Partidos jugados" value={String(c.played)} />
        <StatCard label="Total pagado" value={fmtCOP(c.totalPaid)} />
        <StatCard label="Cancelaciones" value={String(c.cancelled)} />
        <StatCard label="Última vez" value={daysAgoLabel(c.lastPlayedAt, now)} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-5">
          <h2 className="font-semibold text-ink-900">Historial</h2>
          <ul className="mt-2 divide-y divide-ink-100 text-sm">
            {history.map((b) => {
              const st = statusOf(b);
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="text-ink-700">
                    {fechaCorta(b.start_at)} · {courtName.get(b.court_id) ?? "Cancha"}
                    {b.source === "manual" ? " · manual" : ""}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
                </li>
              );
            })}
            {!history.length && <li className="py-6 text-center text-ink-400">Aún no tiene reservas.</li>}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold text-ink-900">Notas privadas</h2>
          <div className="mt-3">
            <CustomerNotesForm customerKey={key} notes={c.notes} tags={c.tags} />
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
