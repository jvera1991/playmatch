import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/navbar";
import { buildWompiCheckoutFields, isWompiConfigured } from "@/lib/wompi";
import { notFound, redirect } from "next/navigation";

export default async function PagarReservaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/reservas/${id}/pagar`);

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, start_at, end_at, total_price, status, courts(name, venues(name, address))")
    .eq("id", id)
    .single();

  if (!booking) notFound();

  const court = booking.courts as unknown as {
    name: string;
    venues: { name: string; address: string };
  };

  if (booking.status === "confirmed") {
    return (
      <main>
        <Navbar />
        <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 text-center">
          <span className="flex h-16 w-16 animate-fade-up items-center justify-center rounded-full bg-brand-100 text-3xl">
            ✅
          </span>
          <h1 className="mt-4 animate-fade-up text-xl font-bold text-ink-900">
            ¡Reserva confirmada!
          </h1>
          <p className="mt-2 animate-fade-up text-sm text-ink-500">
            Te esperamos en {court.name} — {court.venues?.name}. Te llegará un recordatorio
            por WhatsApp una hora antes.
          </p>
        </div>
      </main>
    );
  }

  const fields = isWompiConfigured()
    ? buildWompiCheckoutFields({
        reference: booking.id,
        amountInCents: Math.round(booking.total_price * 100),
        redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/reservas/${booking.id}/pagar`,
      })
    : null;

  return (
    <main>
      <Navbar />
      <div className="mx-auto max-w-lg px-4 py-10">
        <h1 className="text-xl font-bold text-ink-900">Confirma y paga tu reserva</h1>

        <div className="card mt-4 animate-fade-up p-5">
          <p className="font-semibold text-ink-900">{court.name}</p>
          <p className="text-sm text-ink-500">
            {court.venues?.name} — {court.venues?.address}
          </p>
          <p className="mt-2 text-sm text-ink-700">
            {new Date(booking.start_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })} –{" "}
            {new Date(booking.end_at).toLocaleTimeString("es-CO", { timeZone: "America/Bogota" })}
          </p>
          <p className="mt-3 text-2xl font-bold text-brand-700">
            ${booking.total_price.toLocaleString("es-CO")}{" "}
            <span className="text-xs font-normal text-ink-400">COP</span>
          </p>
        </div>

        {fields ? (
          <form action="https://checkout.wompi.co/p/" method="GET" className="mt-6">
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <button className="btn-primary w-full">Pagar con Wompi</button>
          </form>
        ) : (
          <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            El pago en línea todavía no está activado (faltan las llaves de Wompi en el
            servidor). Contacta al administrador de Playmatch para completar tu reserva.
          </div>
        )}

        <p className="mt-4 text-center text-xs text-ink-400">
          Tu cupo queda apartado por 15 minutos mientras pagas. Si no completas el pago, se
          libera automáticamente para otros jugadores.
        </p>
      </div>
    </main>
  );
}
