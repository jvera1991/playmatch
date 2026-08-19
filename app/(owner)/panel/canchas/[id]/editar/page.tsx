import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireOwner } from "@/lib/guards";
import { OWNER_LINKS as LINKS } from "@/lib/owner-links";
import { ComunaBarrioSelect } from "@/components/comuna-barrio-select";
import { SportSizeSelect } from "@/components/sport-size-select";
import { COMUNAS, findComuna } from "@/lib/medellin";
import { geocodeAddress } from "@/lib/geocoding";

export default async function EditarCanchaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reubicar?: string }>;
}) {
  const { id: courtId } = await params;
  const { reubicar } = await searchParams;
  const { supabase, user } = await requireOwner(`/panel/canchas/${courtId}/editar`);

  const { data: court } = await supabase
    .from("courts")
    .select(
      "id, name, sport, size, is_covered, description, price_per_hour, is_active, venue_id, venues(id, name, address, neighborhood, comuna, lat, lng, owner_id)"
    )
    .eq("id", courtId)
    .single();

  const venue = court?.venues as unknown as {
    id: string;
    name: string;
    address: string;
    neighborhood: string | null;
    comuna: string | null;
    lat: number | null;
    lng: number | null;
    owner_id: string;
  } | null;

  if (!court || !venue || venue.owner_id !== user.id) notFound();

  const comunaActual = COMUNAS.find((c) => c.nombre === venue.comuna);

  async function actualizarCancha(formData: FormData) {
    "use server";
    const supabase = await createClient();

    const comunaId = String(formData.get("comuna_id") || "");
    const barrio = String(formData.get("neighborhood") || "");
    const address = String(formData.get("address"));
    const comuna = findComuna(comunaId);
    const direccionCambio = address !== venue!.address || barrio !== venue!.neighborhood;

    // Solo volvemos a geocodificar si la dirección/barrio realmente cambió —
    // así no gastamos cuota de la API de Google si el dueño solo edita el
    // precio o la descripción.
    const coords = direccionCambio
      ? await geocodeAddress(`${address}, ${barrio}, ${comuna?.nombre ?? ""}, Medellín, Colombia`)
      : null;

    await supabase
      .from("venues")
      .update({
        name: String(formData.get("venue_name")),
        address,
        neighborhood: barrio,
        comuna: comuna?.nombre ?? null,
        ...(direccionCambio ? { lat: coords?.lat ?? null, lng: coords?.lng ?? null } : {}),
      })
      .eq("id", venue!.id);

    await supabase
      .from("courts")
      .update({
        sport: String(formData.get("sport")),
        size: String(formData.get("size") || ""),
        name: String(formData.get("name")),
        description: String(formData.get("description") || "") || null,
        price_per_hour: Number(formData.get("price_per_hour")),
        is_active: formData.get("is_active") === "on",
        is_covered: formData.get("is_covered") === "on",
      })
      .eq("id", courtId);

    redirect("/panel/canchas");
  }

  async function reubicarCancha() {
    "use server";
    const supabase = await createClient();
    const comuna = findComuna(comunaActual?.id ?? "");
    const coords = await geocodeAddress(
      `${venue!.address}, ${venue!.neighborhood ?? ""}, ${comuna?.nombre ?? ""}, Medellín, Colombia`
    );
    if (coords) {
      await supabase.from("venues").update({ lat: coords.lat, lng: coords.lng }).eq("id", venue!.id);
    }
    redirect(`/panel/canchas/${courtId}/editar${coords ? "" : "?reubicar=error"}`);
  }

  return (
    <DashboardShell title="Panel del dueño" links={LINKS} activeHref="/panel/canchas">
      <h1 className="text-2xl font-bold text-ink-900">Editar cancha</h1>
      <p className="text-ink-500">Actualiza cualquier dato de esta cancha.</p>

      <form action={actualizarCancha} className="card mt-6 max-w-lg space-y-4 p-6">
        <div>
          <label className="text-sm font-medium text-ink-700">Nombre de la sede</label>
          <input name="venue_name" required defaultValue={venue.name} className="input mt-1" />
        </div>
        <div>
          <label className="text-sm font-medium text-ink-700">Dirección</label>
          <input name="address" required defaultValue={venue.address} className="input mt-1" />
          <p className="mt-1 text-xs text-ink-400">
            Si la cambias, volvemos a ubicar la cancha en el mapa automáticamente.
          </p>
        </div>

        <ComunaBarrioSelect defaultComunaId={comunaActual?.id} defaultBarrio={venue.neighborhood ?? undefined} />

        <div className="rounded-xl border border-ink-100 bg-ink-50 p-3">
          {venue.lat != null && venue.lng != null ? (
            <p className="text-xs text-ink-600">✅ Esta cancha ya aparece ubicada en el mapa.</p>
          ) : (
            <p className="text-xs text-amber-700">
              ⚠️ Esta cancha todavía no tiene ubicación exacta — no aparece en /mapa.
            </p>
          )}
          {reubicar === "error" && (
            <p className="mt-1 text-xs text-red-700">
              No se pudo ubicar con la dirección actual. Revisa que esté completa y bien escrita
              e inténtalo de nuevo.
            </p>
          )}
          <button formAction={reubicarCancha} className="btn-secondary mt-2 !py-1.5 text-xs">
            📍 Volver a ubicar en el mapa
          </button>
        </div>

        <SportSizeSelect defaultSport={court.sport} defaultSize={court.size ?? undefined} />

        <div>
          <label className="text-sm font-medium text-ink-700">Nombre de la cancha</label>
          <input name="name" required defaultValue={court.name} className="input mt-1" />
        </div>
        <div>
          <label className="text-sm font-medium text-ink-700">Descripción (opcional)</label>
          <textarea
            name="description"
            defaultValue={court.description ?? ""}
            rows={3}
            className="input mt-1"
            placeholder="Ej. Grama sintética de última generación, iluminación nocturna, parqueadero incluido"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-ink-700">Precio por hora (COP)</label>
          <input
            name="price_per_hour"
            type="number"
            min={0}
            required
            defaultValue={court.price_per_hour}
            className="input mt-1"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="is_covered" defaultChecked={court.is_covered} className="h-4 w-4 rounded border-ink-300" />
          Cancha techada (cubierta)
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="is_active" defaultChecked={court.is_active} className="h-4 w-4 rounded border-ink-300" />
          Cancha activa (visible para los jugadores)
        </label>
        <p className="text-xs text-ink-400">
          Desmárcalo para ocultarla temporalmente del sitio sin borrar sus datos ni su historial
          de reservas.
        </p>

        <button className="btn-primary w-full">Guardar cambios</button>
      </form>
    </DashboardShell>
  );
}
