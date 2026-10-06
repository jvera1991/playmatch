import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeCustomers, type BookingRow, type CustomerSummary, type Segment } from "@/lib/owner-metrics";

export type CrmCustomer = CustomerSummary & {
  name: string;
  phone: string | null;
  origin: "app" | "manual";
  notes: string | null;
  tags: string[];
  customerRowId: string | null; // fila en owner_customers, si existe
  profileId: string | null;
};

// Une en una sola lista a los clientes del dueño:
// - jugadores registrados que reservaron en línea (llave "p-<profile_id>")
// - clientes del CRM creados a mano (llave "c-<owner_customers.id>")
// Si una fila del CRM apunta a un jugador registrado (profile_id), ambas
// identidades se unen bajo "p-<profile_id>" para no duplicar al cliente.
export async function loadCrm(supabase: SupabaseClient, ownerId: string, bookings: BookingRow[], now = new Date()) {
  const { data: rows } = await supabase
    .from("owner_customers")
    .select("id, profile_id, full_name, phone, notes, tags, created_at")
    .eq("owner_id", ownerId);
  const customerRows = rows ?? [];

  const alias = new Map<string, string>(); // c-id -> p-profile
  for (const r of customerRows) if (r.profile_id) alias.set(`c-${r.id}`, `p-${r.profile_id}`);

  // Reescribe la llave de las reservas manuales de jugadores registrados
  const unified = bookings.map((b) => {
    if (b.source === "manual" && b.customer_id && alias.has(`c-${b.customer_id}`)) {
      const profileId = alias.get(`c-${b.customer_id}`)!.slice(2);
      return { ...b, source: "online" as const, player_id: profileId };
    }
    return b;
  });
  const summaries = summarizeCustomers(unified, now);

  const profileIds = [...summaries.keys()].filter((k) => k.startsWith("p-")).map((k) => k.slice(2));
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id, full_name, whatsapp_number, phone").in("id", profileIds)
    : { data: [] as { id: string; full_name: string | null; whatsapp_number: string | null; phone: string | null }[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const list: CrmCustomer[] = [];
  const seen = new Set<string>();

  for (const s of summaries.values()) {
    seen.add(s.key);
    if (s.key.startsWith("p-")) {
      const pid = s.key.slice(2);
      if (pid === ownerId) continue; // reservas del propio dueño hechas en línea
      const prof = profileById.get(pid);
      const crm = customerRows.find((r) => r.profile_id === pid);
      list.push({
        ...s,
        name: crm?.full_name || prof?.full_name || "Jugador",
        phone: crm?.phone || prof?.whatsapp_number || prof?.phone || null,
        origin: "app",
        notes: crm?.notes ?? null,
        tags: (crm?.tags as string[]) ?? [],
        customerRowId: crm?.id ?? null,
        profileId: pid,
      });
    } else {
      const crm = customerRows.find((r) => `c-${r.id}` === s.key);
      if (!crm) continue;
      list.push({
        ...s,
        name: crm.full_name,
        phone: crm.phone,
        origin: "manual",
        notes: crm.notes,
        tags: (crm.tags as string[]) ?? [],
        customerRowId: crm.id,
        profileId: null,
      });
    }
  }

  // Clientes creados a mano que todavía no tienen reservas
  for (const r of customerRows) {
    const key = r.profile_id ? `p-${r.profile_id}` : `c-${r.id}`;
    if (seen.has(key)) continue;
    list.push({
      key,
      played: 0,
      cancelled: 0,
      totalPaid: 0,
      firstAt: null,
      lastPlayedAt: null,
      nextAt: null,
      segment: "nuevo" as Segment,
      name: r.full_name,
      phone: r.phone,
      origin: r.profile_id ? "app" : "manual",
      notes: r.notes,
      tags: (r.tags as string[]) ?? [],
      customerRowId: r.id,
      profileId: r.profile_id,
    });
  }

  list.sort((a, b) => (b.lastPlayedAt ?? b.nextAt ?? "").localeCompare(a.lastPlayedAt ?? a.nextAt ?? ""));
  return { customers: list, unifiedBookings: unified };
}

export function daysAgoLabel(iso: string | null, now = new Date()) {
  if (!iso) return "—";
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  return `Hace ${days} días`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
