import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingRow, ClosureRow, CourtRow, ScheduleRow } from "@/lib/owner-metrics";

const NONE = ["00000000-0000-0000-0000-000000000000"];

// Carga todo lo que el panel del dueño necesita para KPIs y CRM. Usa el
// cliente con la sesión del dueño, así que RLS garantiza que solo vengan sus
// datos (sus sedes, sus canchas, las reservas de sus canchas).
export async function loadOwnerData(supabase: SupabaseClient, ownerId: string, since: Date) {
  const { data: venues } = await supabase.from("venues").select("id").eq("owner_id", ownerId);
  const venueIds = (venues ?? []).map((v) => v.id as string);

  const { data: courtRows } = await supabase
    .from("courts")
    .select("id, name, price_per_hour, slot_duration_minutes")
    .in("venue_id", venueIds.length ? venueIds : NONE)
    .order("created_at");
  const courts = (courtRows ?? []) as (CourtRow & { price_per_hour: number; slot_duration_minutes: number })[];
  const courtIds = courts.map((c) => c.id);
  const ids = courtIds.length ? courtIds : NONE;

  const [{ data: bookingRows }, { data: scheduleRows }, { data: closureRows }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, court_id, player_id, customer_id, source, status, start_at, end_at, created_at, total_price, owner_payout_amount, cancelled_by, cancellation_reason"
      )
      .in("court_id", ids)
      .gte("start_at", since.toISOString())
      .order("start_at")
      .limit(5000),
    supabase.from("court_schedules").select("court_id, day_of_week, open_time, close_time").in("court_id", ids),
    supabase
      .from("court_closures")
      .select("court_id, start_at, end_at")
      .in("court_id", ids)
      .gte("end_at", since.toISOString()),
  ]);

  return {
    courts,
    bookings: (bookingRows ?? []).map((b) => ({
      ...b,
      total_price: Number(b.total_price),
      owner_payout_amount: Number(b.owner_payout_amount),
    })) as BookingRow[],
    schedules: (scheduleRows ?? []) as ScheduleRow[],
    closures: (closureRows ?? []) as ClosureRow[],
  };
}

// Normaliza un número colombiano y arma el link de WhatsApp con un mensaje.
export function whatsappLink(phone: string | null | undefined, message?: string) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) digits = `57${digits}`;
  if (digits.length < 10) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${text}`;
}
