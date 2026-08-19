import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireOwner } from "@/lib/guards";
import { OWNER_LINKS as LINKS } from "@/lib/owner-links";
import { PhotoUploader } from "@/components/photo-uploader";

export default async function FotosCanchaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courtId } = await params;
  const { supabase, user } = await requireOwner(`/panel/canchas/${courtId}/fotos`);

  // Verificamos que la cancha sea de este dueño antes de mostrar nada (RLS
  // también lo protege, pero así damos un mensaje claro en vez de una lista
  // vacía confusa).
  const { data: court } = await supabase
    .from("courts")
    .select("id, name, is_approved, venues!inner(owner_id)")
    .eq("id", courtId)
    .single();

  const ownerId = (court?.venues as unknown as { owner_id: string } | null)?.owner_id;
  if (!court || ownerId !== user.id) {
    return (
      <DashboardShell title="Panel del dueño" links={LINKS} activeHref="/panel/canchas">
        <div className="card p-8 text-center">
          <p className="text-ink-600">No encontramos esa cancha, o no es tuya.</p>
        </div>
      </DashboardShell>
    );
  }

  const { data: photos } = await supabase
    .from("court_photos")
    .select("id, url, sort_order")
    .eq("court_id", courtId)
    .order("sort_order");

  async function guardarFoto(photo: { path: string; url: string }) {
    "use server";
    const supabase = await createClient();
    const { count } = await supabase
      .from("court_photos")
      .select("id", { count: "exact", head: true })
      .eq("court_id", courtId);
    await supabase.from("court_photos").insert({
      court_id: courtId,
      url: photo.url,
      sort_order: count ?? 0,
    });
    revalidatePath(`/panel/canchas/${courtId}/fotos`);
  }

  async function eliminarFoto(photoId: string, path: string) {
    "use server";
    const supabase = await createClient();
    await supabase.storage.from("court-photos").remove([path]);
    await supabase.from("court_photos").delete().eq("id", photoId);
    revalidatePath(`/panel/canchas/${courtId}/fotos`);
  }

  return (
    <DashboardShell title="Panel del dueño" links={LINKS} activeHref="/panel/canchas">
      <h1 className="text-2xl font-bold text-ink-900">Fotos — {court.name}</h1>
      <p className="text-ink-500">
        Las canchas con buenas fotos reciben muchas más reservas. Sube al menos 3.
      </p>

      {!court.is_approved && (
        <div className="card mt-5 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          ⏳ Esta cancha está pendiente de revisión. Un admin de Playmatch la revisará antes de
          que aparezca públicamente en el sitio — esto suele tomar menos de 24 horas.
        </div>
      )}

      <div className="card mt-5 p-6">
        <PhotoUploader
          courtId={courtId}
          initialPhotos={photos ?? []}
          onSaved={guardarFoto}
          onDeleted={eliminarFoto}
        />
      </div>

      <div className="mt-5 flex justify-end">
        <Link href="/panel/canchas" className="btn-primary">
          Listo, continuar
        </Link>
      </div>
    </DashboardShell>
  );
}
