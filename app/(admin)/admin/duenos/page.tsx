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

export default async function AdminDuenosPage() {
  const { supabase, profile } = await requireAdmin("/admin/duenos");

  if (profile?.role !== "admin") {
    return (
      <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin/duenos">
        <div className="card p-8 text-center">
          <p className="text-ink-600">Esta sección es solo para administradores de Playmatch.</p>
        </div>
      </DashboardShell>
    );
  }

  const { data: pendientes } = await supabase
    .from("profiles")
    .select("id, full_name, phone, whatsapp_number, created_at")
    .eq("role", "owner")
    .eq("is_approved_owner", false)
    .order("created_at", { ascending: true });

  async function aprobar(formData: FormData) {
    "use server";
    const supabase = await createClient();
    await supabase
      .from("profiles")
      .update({ is_approved_owner: true })
      .eq("id", String(formData.get("id")));
    redirect("/admin/duenos");
  }

  async function rechazar(formData: FormData) {
    "use server";
    const supabase = await createClient();
    await supabase.from("profiles").update({ role: "player" }).eq("id", String(formData.get("id")));
    redirect("/admin/duenos");
  }

  return (
    <DashboardShell title="Panel admin" links={LINKS} activeHref="/admin/duenos">
      <h1 className="text-2xl font-bold text-ink-900">Dueños pendientes de aprobación</h1>
      <p className="text-ink-500">
        Revisa que sean negocios reales antes de aprobarlos — una vez aprobados pueden
        publicar canchas visibles para todos.
      </p>

      <div className="card mt-5 divide-y divide-ink-100">
        {pendientes?.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium text-ink-900">{p.full_name}</p>
              <p className="text-sm text-ink-500">
                {p.phone || p.whatsapp_number || "sin teléfono registrado"}
              </p>
            </div>
            <div className="flex gap-2">
              <form action={aprobar}>
                <input type="hidden" name="id" value={p.id} />
                <button className="btn-primary !px-3 !py-1.5 text-sm">Aprobar</button>
              </form>
              <form action={rechazar}>
                <input type="hidden" name="id" value={p.id} />
                <button className="btn-secondary !px-3 !py-1.5 text-sm">Rechazar</button>
              </form>
            </div>
          </div>
        ))}
        {!pendientes?.length && (
          <p className="p-8 text-center text-sm text-ink-400">No hay solicitudes pendientes.</p>
        )}
      </div>
    </DashboardShell>
  );
}
