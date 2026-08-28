import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { CancelBookingForm } from "@/components/cancel-booking-form";

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-brand-50 text-brand-700",
  pending_payment: "bg-amber-50 text-amber-700",
  cancelled: "bg-red-50 text-red-700",
  completed: "bg-ink-100 text-ink-600",
};
const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmada",
  pending_payment: "Esperando pago",
  cancelled: "Cancelada",
  completed: "Jugada",
};

const CANCELACION_HORAS = 3;

export default async function MisReservasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/reservas");

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, start_at, end_at, status, total_price, cancellation_reason, courts(name, venues(name, address))"
    )
    .eq("player_id", user.id)
    .order("start_at", { ascending: false });

  async function cancelarReserva(bookingId: string, motivo: string) {
    "use server";
    const supabase = await createClient();
    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled", cancellation_reason: motivo })
      .eq("id", bookingId);

    revalidatePath("/reservas");
    // El trigger de la base de datos es quien realmente valida el motivo y
    // la ventana de 3 horas — si algo se rechaza, el mensaje llega tal cual
    // desde Postgres.
    return { error: error?.message };
  }

  return (
    <main>
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold text-ink-900">Mis reservas</h1>
        <p className="text-ink-500">
          Puedes cancelar una reserva hasta {CANCELACION_HORAS} horas antes de que empiece.
        </p>

        <div className="mt-6 space-y-3">
          {bookings?.map((b) => {
            const court = b.courts as unknown as {
              name: string;
              venues: { name: string; address: string } | null;
            };
            const startsAt = new Date(b.start_at);
            const cutoff = new Date(startsAt.getTime() - CANCELACION_HORAS * 60 * 60 * 1000);
            const puedeCancelar =
              (b.status === "pending_payment" || b.status === "confirmed") && new Date() < cutoff;

            return (
              <div key={b.id} className="card flex flex-wrap items-start justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold text-ink-900">{court?.name}</p>
                  <p className="text-sm text-ink-500">
                    {court?.venues?.name} · {court?.venues?.address}
                  </p>
                  <p className="mt-1 text-sm text-ink-700">
                    {startsAt.toLocaleString("es-CO", { timeZone: "America/Bogota" })}
                  </p>
                  <p className="mt-1 text-sm font-medium text-ink-800">
                    ${Number(b.total_price).toLocaleString("es-CO")} COP
                  </p>
                  {b.status === "cancelled" && b.cancellation_reason && (
                    <p className="mt-2 text-xs text-ink-500">
                      Motivo: <span className="text-ink-700">{b.cancellation_reason}</span>
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`badge ${STATUS_STYLE[b.status]}`}>{STATUS_LABEL[b.status]}</span>
                  {b.status === "pending_payment" && (
                    <Link href={`/reservas/${b.id}/pagar`} className="btn-primary !py-1.5 text-xs">
                      Completar pago
                    </Link>
                  )}
                  {puedeCancelar && (
                    <CancelBookingForm onCancel={cancelarReserva.bind(null, b.id)} />
                  )}
                  {!puedeCancelar && (b.status === "pending_payment" || b.status === "confirmed") && (
                    <p className="text-right text-xs text-ink-400">
                      Ya no se puede cancelar: faltan menos de {CANCELACION_HORAS}h.
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {!bookings?.length && (
            <div className="card flex flex-col items-center gap-3 p-10 text-center">
              <span className="text-3xl">📅</span>
              <p className="text-ink-500">Todavía no tienes reservas.</p>
              <Link href="/buscar" className="btn-primary">
                Buscar canchas
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
