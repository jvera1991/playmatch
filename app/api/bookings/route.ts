import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const COMMISSION_RATE = 10; // % — Playmatch. Configurable a futuro desde /admin.
const HOLD_MINUTES = 15; // minutos que se aparta un cupo mientras el jugador paga

// POST /api/bookings
// Crea una reserva en estado "pending_payment" y devuelve los datos para
// iniciar el checkout de Wompi (widget o link de pago).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Debes iniciar sesión para reservar." }, { status: 401 });
  }

  const body = await req.json();
  const { court_id, start_at, end_at } = body as {
    court_id: string;
    start_at: string;
    end_at: string;
  };

  if (!court_id || !start_at || !end_at) {
    return NextResponse.json({ error: "Faltan datos de la reserva." }, { status: 400 });
  }

  const { data: court, error: courtError } = await supabase
    .from("courts")
    .select("id, price_per_hour, slot_duration_minutes")
    .eq("id", court_id)
    .single();

  if (courtError || !court) {
    return NextResponse.json({ error: "Cancha no encontrada." }, { status: 404 });
  }

  const hours =
    (new Date(end_at).getTime() - new Date(start_at).getTime()) / (1000 * 60 * 60);
  const total_price = Math.round(court.price_per_hour * hours);
  const commission_amount = Math.round((total_price * COMMISSION_RATE) / 100);
  const owner_payout_amount = total_price - commission_amount;

  // Rechaza si el dueño cerró esta franja manualmente (mantenimiento, evento privado, etc.)
  const { data: closure } = await supabase
    .from("court_closures")
    .select("id")
    .eq("court_id", court_id)
    .lt("start_at", end_at)
    .gt("end_at", start_at)
    .maybeSingle();

  if (closure) {
    return NextResponse.json(
      { error: "El dueño cerró la cancha en ese horario. Elige otro." },
      { status: 409 }
    );
  }

  // Libera cupos "pending_payment" abandonados (el jugador nunca completó el
  // pago) para que no bloqueen el horario indefinidamente. Usa el cliente admin
  // porque RLS no deja que un jugador cancele reservas de otros.
  const expiredBefore = new Date(Date.now() - HOLD_MINUTES * 60_000).toISOString();
  const admin = createAdminClient();
  await admin
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("court_id", court_id)
    .eq("status", "pending_payment")
    .lt("created_at", expiredBefore);

  // El constraint `no_overlapping_bookings` en la base de datos rechaza
  // automáticamente si el horario ya está ocupado — no hace falta chequearlo
  // a mano aquí, evitando condiciones de carrera entre dos reservas simultáneas.
  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      court_id,
      player_id: user.id,
      start_at,
      end_at,
      total_price,
      commission_rate: COMMISSION_RATE,
      commission_amount,
      owner_payout_amount,
      status: "pending_payment",
    })
    .select()
    .single();

  if (error) {
    const isOverlap = error.message.includes("no_overlapping_bookings");
    return NextResponse.json(
      { error: isOverlap ? "Ese horario ya fue reservado. Elige otro." : error.message },
      { status: isOverlap ? 409 : 500 }
    );
  }

  // El checkout de Wompi se construye en /reservas/[id]/pagar (ver lib/wompi.ts)
  // usando booking.id como referencia única de pago.
  return NextResponse.json({ booking }, { status: 201 });
}
