import { DashboardShell, StatCard } from "@/components/dashboard-shell";
import { requireAdmin } from "@/lib/guards";

const LINKS = [
  { href: "/admin", label: "Resumen", icon: "📊" },
  { href: "/admin/duenos", label: "Dueños pendientes", icon: "🧑‍💼" },
  { href: "/admin/canchas", label: "Canchas", icon: "🏟️" },
  { href: "/admin/reservas", label: "Reservas", icon: "📅" },
  { href: "/admin/pagos", label: "Pagos a dueños", icon: "💸" },
];

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

export default async function AdminReservasPage() {
  const { supabase, profile } = await requireAdmin("/admin/reservas");

  if (profile?.role !== "admin") {
    return (
      <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin/reservas">
        <div className="card p-8 text-center">
          <p className="text-ink-600">Esta sección es solo para administradores de Playmatch.</p>
        </div>
      </DashboardShell>
    );
  }

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, start_at, status, total_price, commission_amount, cancellation_reason, courts(name), profiles:player_id(full_name)"
    )
    .order("start_at", { ascending: false })
    .limit(100);

  const totalRecaudado = (bookings ?? [])
    .filter((b) => b.status === "confirmed")
    .reduce((s, b) => s + Number(b.total_price), 0);
  const totalComision = (bookings ?? [])
    .filter((b) => b.status === "confirmed")
    .reduce((s, b) => s + Number(b.commission_amount), 0);

  return (
    <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin/reservas">
      <h1 className="text-2xl font-bold text-ink-900">Todas las reservas</h1>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-2">
        <StatCard label="Recaudado (confirmadas)" value={`$${totalRecaudado.toLocaleString("es-CO")}`} />
        <StatCard label="Comisión Playmatch" value={`$${totalComision.toLocaleString("es-CO")}`} />
      </div>

      <div className="card mt-5 overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-4 py-3">Cancha</th>
              <th className="px-4 py-3">Jugador</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Comisión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {bookings?.map((b) => (
              <tr key={b.id} className="hover:bg-ink-50/50">
                <td className="px-4 py-3 font-medium text-ink-800">
                  {(b.courts as unknown as { name: string })?.name}
                </td>
                <td className="px-4 py-3 text-ink-600">
                  {(b.profiles as unknown as { full_name: string })?.full_name}
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
                  ${Number(b.commission_amount).toLocaleString("es-CO")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!bookings?.length && (
          <p className="p-8 text-center text-sm text-ink-400">Todavía no hay reservas.</p>
        )}
      </div>
    </DashboardShell>
  );
}
