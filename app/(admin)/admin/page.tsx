import Link from "next/link";
import { DashboardShell, StatCard } from "@/components/dashboard-shell";
import { requireAdmin } from "@/lib/guards";

const LINKS = [
  { href: "/admin", label: "Resumen", icon: "📊" },
  { href: "/admin/duenos", label: "Dueños pendientes", icon: "🧑‍💼" },
  { href: "/admin/canchas", label: "Canchas", icon: "🏟️" },
  { href: "/admin/reservas", label: "Reservas", icon: "📅" },
  { href: "/admin/pagos", label: "Pagos a dueños", icon: "💸" },
];

export default async function AdminOverviewPage() {
  const { supabase, profile } = await requireAdmin("/admin");

  if (profile?.role !== "admin") {
    return (
      <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin">
        <div className="card p-8 text-center">
          <p className="text-ink-600">Esta sección es solo para administradores de Playmatch.</p>
        </div>
      </DashboardShell>
    );
  }

  const [
    { count: canchasActivas },
    { count: duenosPendientes },
    { count: reservasConfirmadas },
    { data: comisiones },
  ] = await Promise.all([
    supabase.from("courts").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "owner")
      .eq("is_approved_owner", false),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
    supabase.from("bookings").select("commission_amount").eq("status", "confirmed"),
  ]);

  const totalComisiones = (comisiones ?? []).reduce((s, b) => s + Number(b.commission_amount), 0);

  return (
    <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin">
      <h1 className="text-2xl font-bold text-ink-900">Resumen de Playmatch</h1>
      <p className="text-ink-500">El estado general de la plataforma, de un vistazo.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Canchas activas" value={String(canchasActivas ?? 0)} />
        <StatCard label="Reservas confirmadas" value={String(reservasConfirmadas ?? 0)} />
        <StatCard label="Comisión acumulada" value={`$${totalComisiones.toLocaleString("es-CO")}`} hint="COP" />
        <StatCard label="Dueños por aprobar" value={String(duenosPendientes ?? 0)} />
      </div>

      {!!duenosPendientes && (
        <Link
          href="/admin/duenos"
          className="card mt-6 flex animate-fade-up items-center justify-between p-5 hover:border-brand-300"
        >
          <span className="text-ink-800">
            Tienes <strong>{duenosPendientes}</strong> dueño(s) esperando aprobación.
          </span>
          <span className="text-brand-700">Revisar →</span>
        </Link>
      )}
    </DashboardShell>
  );
}
