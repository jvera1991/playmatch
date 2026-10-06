"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Notas internas del equipo Playmatch sobre jugadores y dueños (06/10/2026).
// La tabla admin_notes solo la lee y escribe un admin (RLS); aquí además se
// verifica el rol para dar un mensaje claro.

const schema = z.object({
  profile_id: z.string().uuid(),
  kind: z.enum(["jugadores", "duenos-y-sedes"]),
  notes: z.string().max(4000),
  tags: z.string().max(400),
});

export type AdminActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function saveAdminNotes(_prev: AdminActionResult | null, formData: FormData): Promise<AdminActionResult> {
  const parsed = schema.safeParse({
    profile_id: formData.get("profile_id"),
    kind: formData.get("kind"),
    notes: String(formData.get("notes") ?? "").trim(),
    tags: String(formData.get("tags") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: "Las notas son demasiado largas." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a ingresar." };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return { ok: false, error: "Solo un administrador puede guardar notas." };

  const tags = parsed.data.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((t) => t.slice(0, 30));

  const { error } = await supabase.from("admin_notes").upsert(
    {
      profile_id: parsed.data.profile_id,
      notes: parsed.data.notes,
      tags,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" }
  );
  if (error) {
    console.error("saveAdminNotes", error.message);
    return { ok: false, error: "No se pudieron guardar las notas." };
  }
  revalidatePath(`/admin/${parsed.data.kind}/${parsed.data.profile_id}`);
  return { ok: true, message: "Notas guardadas." };
}
