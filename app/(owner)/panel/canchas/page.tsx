import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireOwner } from "@/lib/guards";
import { OWNER_LINKS as LINKS } from "@/lib/owner-links";

const SPORT_LABEL: Record<string, string> = { futbol: "Fútbol 5", padel: "Pádel", voley: "Vóley" };

export default async function MisCanchasPage() {
  const { supabase, user, profile } = await requireOwner("/panel/canchas");

  const { data: venues } = await supabase.from("venues").select("id").eq("owner_id", user.id);
  const venueIds = (venues ?? []).map((v) => v.id);

  const { data: courts } = await supabase
    .from("courts")
    .select("id, name, sport, price_per_hour, is_active")
    .in("venue_id", venueIds.length ? venueIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });

  return (
    <DashboardShell title="Panel del dueño" links={LINKS} activeHref="/panel/canchas">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900">Mis canchas</h1>
        {profile?.is_approved_owner && (
          <Link href="/panel/canchas/nueva" className="btn-primary !py-2 text-sm">
            + Publicar cancha
          </Link>
        )}
      </div>

      <div className="mt-5 space-y-3">
        {courts?.map((c) => (
          <div key={c.id} className="card flex items-center justify-between p-4">
            <div>
              <p className="badge bg-brand-50 text-brand-700">{SPORT_LABEL[c.sport] ?? c.sport}</p>
              <p className="mt-1 font-semibold text-ink-900">{c.name}</p>
              <p className="text-sm text-ink-500">
                ${c.price_per_hour.toLocaleString("es-CO")}/hora ·{" "}
                {c.is_active ? (
                  <span className="text-brand-700">activa</span>
                ) : (
                  <span className="text-ink-400">inactiva</span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <Link href={`/panel/canchas/${c.id}/fotos`} className="btn-secondary !py-2 text-sm">
                Fotos
              </Link>
              <Link href={`/panel/canchas/${c.id}/horarios`} className="btn-secondary !py-2 text-sm">
                Horarios
              </Link>
            </div>
          </div>
        ))}

        {!courts?.length && (
          <div className="card flex flex-col items-center gap-3 p-10 text-center">
            <span className="text-3xl">🏟️</span>
            <p className="text-ink-500">Todavía no has publicado ninguna cancha.</p>
            {profile?.is_approved_owner ? (
              <Link href="/panel/canchas/nueva" className="btn-primary">
                Publicar mi primera cancha
              </Link>
            ) : (
              <p className="text-sm text-amber-700">
                Tu cuenta de dueño está en revisión — podrás publicar en cuanto un admin te
                apruebe.
              </p>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
