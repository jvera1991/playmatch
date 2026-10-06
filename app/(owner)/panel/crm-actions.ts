"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Acciones del mini-CRM del dueño (06/10/2026). Todas usan el cliente con la
// sesión del dueño: las reglas reales viven en la base de datos (RLS de
// owner_customers y trigger protect_booking_integrity, migración
// 20261006000002). Aquí solo se valida forma y se traducen errores.

async function currentOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Tu sesión expiró. Vuelve a ingresar.");
  return { supabase, user };
}

const phoneSchema = z
  .string()
  .trim()
  .max(30)
  .regex(/^[0-9+\s()-]*$/, "El WhatsApp solo puede tener números.")
  .optional()
  .transform((v) => (v ? v : null));

// ---------- Reserva manual ----------
const manualSchema = z.object({
  court_id: z.string().uuid("Elige una cancha."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige una fecha."),
  start: z.string().regex(/^\d{2}:\d{2}$/, "Elige una hora."),
  duration: z.coerce.number().int().min(30).max(720),
  customer: z.string().min(1, "Elige o crea un cliente."), // "c-<uuid>", "p-<uuid>" o "new"
  new_name: z.string().trim().max(120).optional(),
  new_phone: phoneSchema,
  price: z.coerce.number().int().min(0).max(10_000_000),
  payment_method: z.enum(["efectivo", "transferencia", "pendiente"]),
});

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

// Hora local de Colombia (UTC-5 fijo) -> ISO UTC
function bogotaToUtcIso(date: string, time: string, plusMinutes = 0) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh + 5, mm + plusMinutes)).toISOString();
}

async function resolveCustomerId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerId: string,
  ref: string,
  newName?: string,
  newPhone?: string | null
): Promise<string> {
  if (ref.startsWith("c-")) return ref.slice(2);

  if (ref.startsWith("p-")) {
    // Jugador registrado: se crea (una sola vez) su ficha en el CRM del dueño.
    const profileId = ref.slice(2);
    const { data: existing } = await supabase
      .from("owner_customers")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (existing) return existing.id as string;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, whatsapp_number, phone")
      .eq("id", profileId)
      .maybeSingle();
    const { data: created, error } = await supabase
      .from("owner_customers")
      .insert({
        owner_id: ownerId,
        profile_id: profileId,
        full_name: profile?.full_name || "Cliente",
        phone: profile?.whatsapp_number || profile?.phone || null,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error("No se pudo preparar la ficha del cliente.");
    return created.id as string;
  }

  if (!newName) throw new Error("Escribe el nombre del cliente nuevo.");
  const { data: created, error } = await supabase
    .from("owner_customers")
    .insert({ owner_id: ownerId, full_name: newName, phone: newPhone ?? null })
    .select("id")
    .single();
  if (error || !created) throw new Error("No se pudo crear el cliente.");
  return created.id as string;
}

export async function createManualBooking(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = manualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  const v = parsed.data;

  try {
    const { supabase, user } = await currentOwner();
    const customerId = await resolveCustomerId(supabase, user.id, v.customer, v.new_name, v.new_phone);
    const start_at = bogotaToUtcIso(v.date, v.start);
    const end_at = bogotaToUtcIso(v.date, v.start, v.duration);

    const { error } = await supabase.from("bookings").insert({
      court_id: v.court_id,
      player_id: user.id,
      source: "manual",
      customer_id: customerId,
      start_at,
      end_at,
      total_price: v.price,
      payment_method: v.payment_method,
    });

    if (error) {
      if (error.message.includes("no_overlapping_bookings")) {
        return { ok: false, error: "Ese horario ya está ocupado en esa cancha." };
      }
      if (error.code === "P0001") return { ok: false, error: error.message };
      console.error("[createManualBooking]", error);
      return { ok: false, error: "No se pudo guardar la reserva. Intenta de nuevo." };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error inesperado." };
  }

  revalidatePath("/panel/calendario");
  revalidatePath("/panel");
  revalidatePath("/panel/clientes");
  return { ok: true, message: "Reserva guardada. El horario quedó bloqueado." };
}

// ---------- Clientes ----------
const customerSchema = z.object({
  full_name: z.string().trim().min(1, "Escribe el nombre.").max(120),
  phone: phoneSchema,
});

export async function createCustomer(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  try {
    const { supabase, user } = await currentOwner();
    const { error } = await supabase
      .from("owner_customers")
      .insert({ owner_id: user.id, full_name: parsed.data.full_name, phone: parsed.data.phone });
    if (error) return { ok: false, error: "No se pudo crear el cliente." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error inesperado." };
  }
  revalidatePath("/panel/clientes");
  return { ok: true, message: "Cliente agregado." };
}

const notesSchema = z.object({
  key: z.string().regex(/^[cp]-[0-9a-f-]{36}$/),
  notes: z.string().max(2000).optional().default(""),
  tags: z.string().max(400).optional().default(""),
});

export async function saveCustomerNotes(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = notesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Las notas son demasiado largas." };
  const tags = parsed.data.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((t) => t.slice(0, 30));

  try {
    const { supabase, user } = await currentOwner();
    const customerId = await resolveCustomerId(supabase, user.id, parsed.data.key);
    const { error } = await supabase
      .from("owner_customers")
      .update({ notes: parsed.data.notes || null, tags, updated_at: new Date().toISOString() })
      .eq("id", customerId);
    if (error) return { ok: false, error: "No se pudieron guardar las notas." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error inesperado." };
  }
  revalidatePath(`/panel/clientes/${parsed.data.key}`);
  return { ok: true, message: "Notas guardadas." };
}
