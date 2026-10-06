import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

// Webhook de eventos de Wompi. Configúralo en:
// https://comercios.wompi.co -> Desarrolladores -> Eventos
// URL: https://tu-dominio.co/api/webhooks/wompi
//
// Auditoría 06/10/2026:
// - CRÍTICO corregido: si WOMPI_EVENTS_SECRET estaba vacío (hoy lo está,
//   Wompi aún no se conecta), la firma esperada se calculaba con un secreto
//   vacío y CUALQUIERA podía fabricar un evento "APPROVED" válido para
//   confirmar reservas sin pagar. Ahora sin secreto el webhook se rechaza.
// - Se verifica que el monto y la moneda pagados coincidan con la reserva.
// - Solo se confirma una reserva que esté pendiente de pago.
export async function POST(req: NextRequest) {
  const secret = process.env.WOMPI_EVENTS_SECRET?.trim();
  if (!secret) {
    console.error("[webhook wompi] WOMPI_EVENTS_SECRET no está configurado; evento rechazado.");
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 503 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // 1. Verificar la firma del evento (evita que cualquiera falsifique un "pago exitoso")
  const { signature, timestamp, data } = payload as {
    signature?: { properties?: unknown; checksum?: unknown };
    timestamp?: unknown;
    data?: { transaction?: Record<string, unknown> };
  };
  const properties = Array.isArray(signature?.properties) ? (signature.properties as unknown[]) : [];
  if (!properties.length || properties.some((p) => typeof p !== "string")) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const concat = (properties as string[]).map((p) => String(getNestedValue(payload, p) ?? "")).join("");
  const toHash = concat + String(timestamp ?? "") + secret;
  const expected = crypto.createHash("sha256").update(toHash).digest("hex");
  const received = typeof signature?.checksum === "string" ? signature.checksum : "";

  // Comparación en tiempo constante: evita deducir la firma midiendo tiempos.
  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(received, "hex");
  const valid =
    expectedBuf.length === receivedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, receivedBuf);

  if (!valid) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const transaction = data?.transaction;
  if (!transaction) {
    return NextResponse.json({ ok: true }); // evento que no nos interesa
  }

  const bookingId = String(transaction.reference ?? ""); // usamos booking.id como referencia
  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, total_price")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) {
    console.error(`[webhook wompi] Reserva ${bookingId} no encontrada.`);
    return NextResponse.json({ ok: true });
  }

  if (transaction.status === "APPROVED") {
    const expectedCents = Math.round(Number(booking.total_price) * 100);
    const paidCents = Number(transaction.amount_in_cents);
    if (transaction.currency !== "COP" || paidCents !== expectedCents) {
      console.error(
        `[webhook wompi] Monto no coincide para ${bookingId}: pagó ${paidCents} ${String(transaction.currency)}, esperado ${expectedCents} COP. No se confirma.`
      );
      return NextResponse.json({ ok: true });
    }

    if (booking.status !== "pending_payment") {
      // Ej.: el cupo se liberó porque el pago tardó más de 15 minutos. Hay que
      // revisarlo a mano (y probablemente reembolsar) — no se reactiva solo
      // porque el horario pudo haberlo tomado otra persona.
      console.error(
        `[webhook wompi] Pago aprobado para reserva ${bookingId} en estado "${booking.status}". Revisar manualmente.`
      );
      return NextResponse.json({ ok: true });
    }

    await admin
      .from("bookings")
      .update({ status: "confirmed", wompi_transaction_id: String(transaction.id) })
      .eq("id", bookingId)
      .eq("status", "pending_payment");
    // TODO: encolar notificación de confirmación (WhatsApp/email) aquí.
  } else if (["DECLINED", "ERROR"].includes(String(transaction.status))) {
    await admin
      .from("bookings")
      .update({ status: "cancelled", cancellation_reason: "Pago rechazado por Wompi." })
      .eq("id", bookingId)
      .eq("status", "pending_payment");
  } else if (transaction.status === "VOIDED") {
    await admin
      .from("bookings")
      .update({ status: "cancelled", cancellation_reason: "Pago anulado en Wompi." })
      .eq("id", bookingId)
      .neq("status", "cancelled");
  }

  return NextResponse.json({ ok: true });
}

function getNestedValue(obj: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}
