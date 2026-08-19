import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireOwner } from "@/lib/guards";
import { ComunaBarrioSelect } from "@/components/comuna-barrio-select";
import { SportSizeSelect } from "@/components/sport-size-select";
import { findComuna } from "@/lib/medellin";
import { geocodeAddress } from "@/lib/geocoding";
import { OWNER_LINKS as LINKS } from "@/lib/owner-links";

// Formulario para que el dueño publique una nueva cancha.
// TODO: subir fotos a Supabase Storage (bucket "court-photos") y guardarlas en court_photos.
export default async function NuevaCanchaPage() {
  const { profile } = await requireOwner("/panel/canchas/nueva");

  if (profile?.role !== "owner" || !profile.is_approved_owner) {
    return (
      <DashboardShell title="Panel del dueño" links={LINKS} activeHref="/panel/canchas">
        <div className="card p-8 text-center">
          <h1 className="text-lg font-bold text-ink-900">Tu cuenta de dueño está en revisión</h1>
          <p className="mt-2 text-sm text-ink-500">
            Un administrador de Playmatch tiene que aprobar tu cuenta antes de que puedas
            publicar canchas. Esto suele tomar menos de 24 horas.
          </p>
        </div>
      </DashboardShell>
    );
  }

  async function crearCancha(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // 1. Asegura que exista una sede (venue) para este dueño; si no, la crea.
    let { data: venue } = await supabase
      .from("venues")
      .select("id")
      .eq("owner_id", user!.id)
      .limit(1)
      .maybeSingle();

    const comunaId = String(formData.get("comuna_id") || "");
    const barrio = String(formData.get("neighborhood") || "");
    const address = String(formData.get("address"));
    const comuna = findComuna(comunaId);

    // Geocodificamos la dirección completa (dirección + barrio + comuna +
    // ciudad) para ubicar la cancha con precisión en el mapa. Si falla (llave
    // de Google Maps no configurada, dirección ambigua, etc.) no bloqueamos
    // la publicación — solo no aparecerá en el mapa hasta corregirse.
    const coords = await geocodeAddress(
      `${address}, ${barrio}, ${comuna?.nombre ?? ""}, Medellín, Colombia`
    );

    if (!venue) {
      const { data: newVenue } = await supabase
        .from("venues")
        .insert({
          owner_id: user!.id,
          name: String(formData.get("venue_name")),
          address,
          neighborhood: barrio,
          comuna: comuna?.nombre ?? null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        })
        .select("id")
        .single();
      venue = newVenue;
    } else {
      // Ya tenía una sede — actualizamos su dirección/comuna/coordenadas por
      // si esta nueva cancha queda en una ubicación distinta a la anterior.
      await supabase
        .from("venues")
        .update({
          address,
          neighborhood: barrio,
          comuna: comuna?.nombre ?? null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        })
        .eq("id", venue.id);
    }

    const { data: newCourt } = await supabase
      .from("courts")
      .insert({
        venue_id: venue!.id,
        sport: String(formData.get("sport")),
        size: String(formData.get("size") || ""),
        name: String(formData.get("name")),
        price_per_hour: Number(formData.get("price_per_hour")),
        is_covered: formData.get("is_covered") === "on",
      })
      .select("id")
      .single();

    // Llevamos al dueño directo a subir fotos — es lo primero que un jugador
    // ve, mejor que lo haga de una vez en vez de dejarlo para después.
    redirect(`/panel/canchas/${newCourt!.id}/fotos`);
  }

  return (
    <DashboardShell title="Panel del dueño" links={LINKS} activeHref="/panel/canchas">
      <h1 className="text-2xl font-bold text-ink-900">Publicar una cancha</h1>
      <p className="text-ink-500">Cuéntanos dónde queda y qué ofreces.</p>

      <form action={crearCancha} className="card mt-6 max-w-lg space-y-4 p-6">
        <div>
          <label className="text-sm font-medium text-ink-700">Nombre de la sede</label>
          <input name="venue_name" required className="input mt-1" placeholder="Ej. Complejo Deportivo Laureles" />
        </div>
        <div>
          <label className="text-sm font-medium text-ink-700">Dirección</label>
          <input
            name="address"
            required
            className="input mt-1"
            placeholder="Ej. Cra 70 # 45-12"
          />
          <p className="mt-1 text-xs text-ink-400">
            La usamos para ubicar tu cancha con precisión en el mapa.
          </p>
        </div>

        <ComunaBarrioSelect />

        <SportSizeSelect />

        <div>
          <label className="text-sm font-medium text-ink-700">Nombre de la cancha</label>
          <input name="name" required className="input mt-1" placeholder="Ej. Cancha 1" />
        </div>
        <div>
          <label className="text-sm font-medium text-ink-700">Precio por hora (COP)</label>
          <input name="price_per_hour" type="number" min={0} required className="input mt-1" />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="is_covered" className="h-4 w-4 rounded border-ink-300" />
          Cancha techada (cubierta)
        </label>

        <button className="btn-primary w-full">Publicar cancha</button>
      </form>
    </DashboardShell>
  );
}
