import Link from "next/link";
import { Buildings, Umbrella, HourglassMedium } from "@phosphor-icons/react/ssr";
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
    .select("id, name, sport, size, is_covered, price_per_hour, is_active, is_approved")
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
          <div key={c.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="flex flex-wrap gap-1.5">
                <p className="badge bg-brand-50 text-brand-700">{SPORT_LABEL[c.sport] ?? c.sport}</p>
                {c.size && <p className="badge bg-ink-100 text-ink-600">{c.size}</p>}
                {c.is_covered && (
                  <p className="badge inline-flex items-center gap-1 bg-sky-50 text-sky-700">
                    <Umbrella weight="fill" size={12} /> Techada
                  </p>
                )}
              </div>
              <p className="mt-1 font-semibold text-ink-900">{c.name}</p>
              <p className="text-sm text-ink-500">
                ${c.price_per_hour.toLocaleString("es-CO")}/hora ·{" "}
                {c.is_active ? (
                  <span className="text-brand-700">activa</span>
                ) : (
                  <span className="text-ink-400">inactiva</span>
                )}
              </p>
              {!c.is_approved && (
                <p className="mt-1 badge inline-flex items-center gap-1 bg-amber-50 text-amber-700">
                  <HourglassMedium weight="fill" size={12} /> Pendiente de revisión por un admin
                </p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Link href={`/panel/canchas/${c.id}/editar`} className="btn-secondary !py-2 text-sm">
                Editar
              </Link>
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
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Buildings weight="duotone" size={28} />
            </span>
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
