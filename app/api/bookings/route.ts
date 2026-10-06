import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// % — Playmatch. OJO: el precio y la comisión definitivos los recalcula la
// base de datos (trigger protect_booking_integrity, migración
// 20261006000001) — si cambias este valor, cámbialo también allá.
const COMMISSION_RATE = 10;
const HOLD_MINUTES = 15; // minutos que se aparta un cupo mientras el jugador paga

// POST /api/bookings
// Crea una reserva en estado "pending_payment" y devuelve los datos para
// iniciar el checkout de Wompi (widget o link de pago).
export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    // Cualquier excepción no controlada (ej. falta una variable de entorno
    // como SUPABASE_SERVICE_ROLE_KEY) antes solo generaba una página de error
    // de Next.js sin cuerpo — el navegador fallaba con "Unexpected end of
    // JSON input" al intentar leerla como JSON, sin decir la causa real.
    // Ahora sí devolvemos JSON con el mensaje, para poder diagnosticarlo.
    console.error("[POST /api/bookings] error no controlado:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error inesperado al crear la reserva." },
      { status: 500 }
    );
  }
}

async function handlePost(req: NextRequest) {
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

  const startMs = Date.parse(start_at);
  const endMs = Date.parse(end_at);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return NextResponse.json({ error: "Horario de reserva inválido." }, { status: 400 });
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
    if (isOverlap) {
      return NextResponse.json({ error: "Ese horario ya fue reservado. Elige otro." }, { status: 409 });
    }
    // P0001 = validación del trigger protect_booking_integrity (cancha no
    // disponible, fuera de horario, horario pasado...). La base de datos es
    // la autoridad sobre precio y reglas; aquí solo se traduce a un 400.
    if (error.code === "P0001") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[POST /api/bookings] error de base de datos:", error);
    return NextResponse.json({ error: "No se pudo crear la reserva. Intenta de nuevo." }, { status: 500 });
  }

  // El checkout de Wompi se construye en /reservas/[id]/pagar (ver lib/wompi.ts)
  // usando booking.id como referencia única de pago.
  return NextResponse.json({ booking }, { status: 201 });
}
