import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Se dispara periódicamente (ver supabase/migrations/..._pg_cron.sql o un
// cron del sistema en el VPS) para mandar el recordatorio de WhatsApp 1h antes.
// Protegido con un secreto simple para que no lo llame cualquiera.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const in1h = new Date(Date.now() + 60 * 60 * 1000);
  const in1h5 = new Date(Date.now() + 65 * 60 * 1000); // ventana de 5 min

  const { data: bookings } = await admin
    .from("bookings")
    .select(
      "id, start_at, reminder_sent_at, courts(name, venues(name, address)), profiles:player_id(whatsapp_number, full_name)"
    )
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .gte("start_at", in1h.toISOString())
    .lt("start_at", in1h5.toISOString());

  for (const booking of bookings ?? []) {
    // TODO: llamar a la WhatsApp Cloud API (Meta) con una plantilla aprobada
    // tipo "utility" — ej: "Tu reserva en {{cancha}} es a las {{hora}} en {{direccion}}".
    // await sendWhatsAppReminder(booking)

    await admin
      .from("bookings")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", booking.id);

    await admin.from("notifications_log").insert({
      booking_id: booking.id,
      channel: "whatsapp",
      status: "sent",
    });
  }

  return NextResponse.json({ processed: bookings?.length ?? 0 });
}
