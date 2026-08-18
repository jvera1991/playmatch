import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

// Webhook de eventos de Wompi. Configúralo en:
// https://comercios.wompi.co -> Desarrolladores -> Eventos
// URL: https://tu-dominio.co/api/webhooks/wompi
export async function POST(req: NextRequest) {
  const payload = await req.json();

  // 1. Verificar la firma del evento (evita que cualquiera falsifique un "pago exitoso")
  const secret = process.env.WOMPI_EVENTS_SECRET!;
  const { signature, timestamp, data } = payload;
  const properties = signature?.properties ?? [];

  const concat = properties.map((p: string) => getNestedValue(payload, p)).join("");
  const toHash = concat + timestamp + secret;
  const expected = crypto.createHash("sha256").update(toHash).digest("hex");

  if (expected !== signature?.checksum) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const transaction = data?.transaction;
  if (!transaction) {
    return NextResponse.json({ ok: true }); // evento que no nos interesa
  }

  const bookingId = transaction.reference; // usamos booking.id como referencia
  const admin = createAdminClient();

  if (transaction.status === "APPROVED") {
    await admin
      .from("bookings")
      .update({ status: "confirmed", wompi_transaction_id: transaction.id })
      .eq("id", bookingId);
    // TODO: encolar notificación de confirmación (WhatsApp/email) aquí.
  } else if (["DECLINED", "ERROR", "VOIDED"].includes(transaction.status)) {
    await admin.from("bookings").update({ status: "cancelled" }).eq("id", bookingId);
  }

  return NextResponse.json({ ok: true });
}

function getNestedValue(obj: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}
