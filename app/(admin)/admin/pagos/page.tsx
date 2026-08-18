import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireAdmin } from "@/lib/guards";

const LINKS = [
  { href: "/admin", label: "Resumen", icon: "📊" },
  { href: "/admin/duenos", label: "Dueños pendientes", icon: "🧑‍💼" },
  { href: "/admin/canchas", label: "Canchas", icon: "🏟️" },
  { href: "/admin/reservas", label: "Reservas", icon: "📅" },
  { href: "/admin/pagos", label: "Pagos a dueños", icon: "💸" },
];

interface PendingRow {
  owner_id: string;
  owner_name: string;
  total: number;
  count: number;
  minDate: string;
  maxDate: string;
}

export default async function AdminPagosPage() {
  const { supabase, profile } = await requireAdmin("/admin/pagos");

  if (profile?.role !== "admin") {
    return (
      <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin/pagos">
        <div className="card p-8 text-center">
          <p className="text-ink-600">Esta sección es solo para administradores de Playmatch.</p>
        </div>
      </DashboardShell>
    );
  }

  // Reservas ya jugadas (confirmed + fecha pasada) — asumimos que todavía no se
  // han pagado (no hay vínculo directo booking↔payout en este MVP; el admin
  // registra el pago manualmente y eso queda en `payouts` como comprobante).
  const { data: bookings } = await supabase
    .from("bookings")
    .select("owner_payout_amount, start_at, courts(venues(owner_id, profiles:owner_id(full_name)))")
    .eq("status", "confirmed")
    .lt("start_at", new Date().toISOString());

  const porDueno = new Map<string, PendingRow>();
  for (const b of bookings ?? []) {
    const venue = (b.courts as unknown as { venues: { owner_id: string; profiles: { full_name: string } } })
      ?.venues;
    if (!venue) continue;
    const key = venue.owner_id;
    const existing = porDueno.get(key);
    const amount = Number(b.owner_payout_amount);
    if (existing) {
      existing.total += amount;
      existing.count += 1;
      if (b.start_at < existing.minDate) existing.minDate = b.start_at;
      if (b.start_at > existing.maxDate) existing.maxDate = b.start_at;
    } else {
      porDueno.set(key, {
        owner_id: key,
        owner_name: venue.profiles?.full_name ?? "—",
        total: amount,
        count: 1,
        minDate: b.start_at,
        maxDate: b.start_at,
      });
    }
  }

  async function registrarPago(formData: FormData) {
    "use server";
    const supabase = await createClient();
    await supabase.from("payouts").insert({
      owner_id: String(formData.get("owner_id")),
      period_start: String(formData.get("period_start")).slice(0, 10),
      period_end: String(formData.get("period_end")).slice(0, 10),
      amount: Number(formData.get("amount")),
      status: "paid",
      paid_at: new Date().toISOString(),
    });
    redirect("/admin/pagos");
  }

  return (
    <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin/pagos">
      <h1 className="text-2xl font-bold text-ink-900">Pagos pendientes a dueños</h1>
      <p className="text-ink-500">
        Transfiere manualmente por tu banco y luego marca aquí el pago como hecho.
      </p>

      <div className="card mt-5 divide-y divide-ink-100">
        {Array.from(porDueno.values()).map((row) => (
          <div key={row.owner_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium text-ink-900">{row.owner_name}</p>
              <p className="text-sm text-ink-500">
                {row.count} reserva(s) · {row.minDate.slice(0, 10)} a {row.maxDate.slice(0, 10)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-brand-700">
                ${row.total.toLocaleString("es-CO")}
              </span>
              <form action={registrarPago}>
                <input type="hidden" name="owner_id" value={row.owner_id} />
                <input type="hidden" name="amount" value={row.total} />
                <input type="hidden" name="period_start" value={row.minDate} />
                <input type="hidden" name="period_end" value={row.maxDate} />
                <button className="btn-primary !px-3 !py-1.5 text-sm">Marcar como pagado</button>
              </form>
            </div>
          </div>
        ))}
        {!porDueno.size && (
          <p className="p-8 text-center text-sm text-ink-400">No hay pagos pendientes por ahora.</p>
        )}
      </div>
    </DashboardShell>
  );
}
