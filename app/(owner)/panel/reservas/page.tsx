import { DashboardShell } from "@/components/dashboard-shell";
import { requireOwner } from "@/lib/guards";
import { OWNER_LINKS as LINKS } from "@/lib/owner-links";

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-brand-50 text-brand-700",
  pending_payment: "bg-amber-50 text-amber-700",
  cancelled: "bg-red-50 text-red-700",
  completed: "bg-ink-100 text-ink-600",
};
const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmada",
  pending_payment: "Esperando pago",
  cancelled: "Cancelada",
  completed: "Jugada",
};

export default async function ReservasPage({
  searchParams,
}: {
  searchParams: Promise<{ cancha?: string }>;
}) {
  const { cancha } = await searchParams;
  const { supabase, user } = await requireOwner("/panel/reservas");

  const { data: venues } = await supabase.from("venues").select("id").eq("owner_id", user.id);
  const venueIds = (venues ?? []).map((v) => v.id);

  const { data: courts } = await supabase
    .from("courts")
    .select("id, name")
    .in("venue_id", venueIds.length ? venueIds : ["00000000-0000-0000-0000-000000000000"]);
  const courtIds = (courts ?? []).map((c) => c.id);

  let query = supabase
    .from("bookings")
    .select(
      "id, start_at, end_at, status, total_price, owner_payout_amount, cancellation_reason, courts(name), profiles:player_id(full_name, whatsapp_number, phone)"
    )
    .in("court_id", courtIds.length ? courtIds : ["00000000-0000-0000-0000-000000000000"])
    .order("start_at", { ascending: false })
    .limit(50);

  if (cancha) query = query.eq("court_id", cancha);

  const { data: bookings } = await query;

  return (
    <DashboardShell title="Panel del dueño" links={LINKS} activeHref="/panel/reservas">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Reservas</h1>
        <div className="flex flex-wrap gap-2">
          <a
            href="/panel/reservas"
            className={`rounded-full border px-3 py-1.5 text-sm ${!cancha ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 text-ink-700"}`}
          >
            Todas
          </a>
          {courts?.map((c) => (
            <a
              key={c.id}
              href={`/panel/reservas?cancha=${c.id}`}
              className={`rounded-full border px-3 py-1.5 text-sm ${cancha === c.id ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 text-ink-700"}`}
            >
              {c.name}
            </a>
          ))}
        </div>
      </div>

      <div className="card mt-5 overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-4 py-3">Cancha</th>
              <th className="px-4 py-3">Jugador</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Te corresponde</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {bookings?.map((b) => {
              const player = b.profiles as unknown as { full_name: string; whatsapp_number: string | null };
              return (
                <tr key={b.id} className="hover:bg-ink-50/50">
                  <td className="px-4 py-3 font-medium text-ink-800">
                    {(b.courts as unknown as { name: string })?.name}
                  </td>
                  <td className="px-4 py-3 text-ink-600">
                    {player?.full_name}
                    {player?.whatsapp_number && (
                      <span className="block text-xs text-ink-400">{player.whatsapp_number}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-600">
                    {new Date(b.start_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${STATUS_STYLE[b.status]}`}>{STATUS_LABEL[b.status]}</span>
                    {b.status === "cancelled" && b.cancellation_reason && (
                      <p className="mt-1 max-w-[220px] text-xs text-ink-400">{b.cancellation_reason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-ink-800">
                    ${Number(b.owner_payout_amount).toLocaleString("es-CO")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!bookings?.length && (
          <p className="p-8 text-center text-sm text-ink-400">Todavía no tienes reservas.</p>
        )}
      </div>
    </DashboardShell>
  );
}
