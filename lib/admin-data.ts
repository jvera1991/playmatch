import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingRow, ClosureRow, ScheduleRow } from "@/lib/owner-metrics";

// Carga de datos del panel admin (06/10/2026). Usa el cliente con la sesión
// del admin: las policies de RLS ya le dan lectura de todo (reservas, perfiles,
// canchas, sedes). No requiere service role.

export type AdminBooking = BookingRow & { commission_amount: number };
export type AdminCourt = {
  id: string;
  venue_id: string;
  name: string;
  sport: "futbol" | "padel" | "voley";
  price_per_hour: number;
  is_active: boolean;
  is_approved: boolean;
  created_at: string;
};
export type AdminVenue = { id: string; owner_id: string; name: string; neighborhood: string | null; is_active: boolean };
export type AdminProfile = {
  id: string;
  full_name: string;
  phone: string | null;
  whatsapp_number: string | null;
  role: "player" | "owner" | "admin";
  is_approved_owner: boolean;
  created_at: string;
};

const PAGE = 1000;

// PostgREST corta en 1000 filas por consulta: se pagina hasta traer todo.
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maxPages = 30
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const { data } = await build(i * PAGE, i * PAGE + PAGE - 1);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export async function loadAdminData(supabase: SupabaseClient, since: Date) {
  const sinceIso = since.toISOString();

  const [bookingRows, profileRows, courtRows, venueRows, scheduleRows, closureRows, payoutRows, photoRows] = await Promise.all([
    fetchAll<Record<string, unknown>>((a, b) =>
      supabase
        .from("bookings")
        .select(
          "id, court_id, player_id, customer_id, source, status, start_at, end_at, created_at, total_price, owner_payout_amount, commission_amount, cancelled_by, cancellation_reason"
        )
        .gte("start_at", sinceIso)
        .order("start_at")
        .order("id")
        .range(a, b)
    ),
    fetchAll<AdminProfile>((a, b) =>
      supabase
        .from("profiles")
        .select("id, full_name, phone, whatsapp_number, role, is_approved_owner, created_at")
        .order("created_at")
        .order("id")
        .range(a, b)
    ),
    fetchAll<AdminCourt>((a, b) =>
      supabase
        .from("courts")
        .select("id, venue_id, name, sport, price_per_hour, is_active, is_approved, created_at")
        .order("created_at")
        .order("id")
        .range(a, b)
    ),
    fetchAll<AdminVenue>((a, b) =>
      supabase.from("venues").select("id, owner_id, name, neighborhood, is_active").order("created_at").order("id").range(a, b)
    ),
    fetchAll<ScheduleRow>((a, b) =>
      supabase.from("court_schedules").select("court_id, day_of_week, open_time, close_time").order("id").range(a, b)
    ),
    fetchAll<ClosureRow>((a, b) =>
      supabase.from("court_closures").select("court_id, start_at, end_at").gte("end_at", sinceIso).order("id").range(a, b)
    ),
    fetchAll<{ owner_id: string; amount: number; status: string }>((a, b) =>
      supabase.from("payouts").select("owner_id, amount, status").eq("status", "paid").order("id").range(a, b)
    ),
    fetchAll<{ court_id: string }>((a, b) => supabase.from("court_photos").select("court_id").order("id").range(a, b)),
  ]);

  return {
    bookings: bookingRows.map((b) => ({
      ...b,
      total_price: Number(b.total_price),
      owner_payout_amount: Number(b.owner_payout_amount),
      commission_amount: Number(b.commission_amount),
    })) as AdminBooking[],
    profiles: profileRows,
    courts: courtRows.map((c) => ({ ...c, price_per_hour: Number(c.price_per_hour) })),
    venues: venueRows,
    schedules: scheduleRows,
    closures: closureRows,
    paidPayouts: payoutRows.map((p) => ({ ...p, amount: Number(p.amount) })),
    courtsWithPhotos: [...new Set(photoRows.map((p) => p.court_id))],
  };
}

export type AdminData = Awaited<ReturnType<typeof loadAdminData>>;
