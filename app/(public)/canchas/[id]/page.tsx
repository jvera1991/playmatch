import { createClient } from "@/lib/supabase/server";
import { getAvailableSlots } from "@/lib/availability";
import { SlotPicker } from "@/components/slot-picker";
import { Navbar } from "@/components/navbar";
import { notFound } from "next/navigation";
import { Umbrella } from "@phosphor-icons/react/ssr";
import { SportIcon, SPORT_LABEL } from "@/components/sport-icon";

function hoyBogota() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

export default async function CanchaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { id } = await params;
  const { fecha } = await searchParams;
  const dateStr = fecha || hoyBogota();

  const supabase = await createClient();

  const { data: court } = await supabase
    .from("courts")
    .select(
      "id, name, sport, size, is_covered, price_per_hour, slot_duration_minutes, description, venues(name, address, neighborhood, city, lat, lng), court_photos(url, sort_order)"
    )
    .eq("id", id)
    .eq("is_active", true)
    .eq("is_approved", true)
    .single();

  if (!court) notFound();

  const dayStart = `${dateStr}T00:00:00-05:00`;
  const dayEnd = `${dateStr}T23:59:59-05:00`;

  const [{ data: schedules }, { data: closures }, { data: bookings }] = await Promise.all([
    supabase.from("court_schedules").select("day_of_week, open_time, close_time").eq("court_id", id),
    supabase
      .from("court_closures")
      .select("start_at, end_at")
      .eq("court_id", id)
      .lt("start_at", dayEnd)
      .gt("end_at", dayStart),
    supabase
      .from("bookings")
      .select("start_at, end_at")
      .eq("court_id", id)
      .in("status", ["pending_payment", "confirmed"])
      .lt("start_at", dayEnd)
      .gt("end_at", dayStart),
  ]);

  const slots = getAvailableSlots({
    dateStr,
    slotMinutes: court.slot_duration_minutes,
    schedules: schedules ?? [],
    closures: closures ?? [],
    bookings: bookings ?? [],
  });

  const venue = court.venues as unknown as {
    name: string;
    address: string;
    neighborhood: string;
    city: string;
    lat: number | null;
    lng: number | null;
  };

  const photos = ((court.court_photos as { url: string; sort_order: number }[] | null) ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  const proximosDias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${hoyBogota()}T12:00:00-05:00`);
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  });

  return (
    <main>
      <Navbar />

      {photos.length ? (
        <div className="flex h-56 gap-1 overflow-x-auto sm:h-72">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.url} src={p.url} alt={court.name} className="h-full w-auto shrink-0 object-cover sm:flex-1" />
          ))}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center bg-brand-gradient sm:h-56">
          <SportIcon sport={court.sport} weight="duotone" size={64} className="text-white drop-shadow" />
        </div>
      )}

      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="animate-fade-up">
          <div className="flex flex-wrap gap-1.5">
            <p className="badge bg-brand-50 text-brand-700">{SPORT_LABEL[court.sport] ?? court.sport}</p>
            {court.size && <p className="badge bg-ink-100 text-ink-600">{court.size}</p>}
            {court.is_covered && (
              <p className="badge inline-flex items-center gap-1 bg-sky-50 text-sky-700">
                <Umbrella weight="fill" size={12} /> Techada
              </p>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-bold text-ink-900 sm:text-3xl">{court.name}</h1>
          <p className="mt-1 text-ink-500">
            {venue?.name} · {venue?.address}, {venue?.neighborhood}, {venue?.city}
          </p>
          {court.description && <p className="mt-3 text-sm text-ink-600">{court.description}</p>}
          <p className="mt-4 text-2xl font-bold text-brand-700">
            ${court.price_per_hour.toLocaleString("es-CO")}{" "}
            <span className="text-sm font-normal text-ink-400">/ hora</span>
          </p>
        </div>

        <div className="card mt-8 animate-fade-up p-5" style={{ animationDelay: "80ms" }}>
          <h2 className="text-sm font-semibold text-ink-800">Elige un día</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {proximosDias.map((d) => (
              <a
                key={d}
                href={`?fecha=${d}`}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  d === dateStr
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-ink-200 text-ink-700 hover:border-brand-400"
                }`}
              >
                {new Date(`${d}T12:00:00-05:00`).toLocaleDateString("es-CO", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  timeZone: "America/Bogota",
                })}
              </a>
            ))}
          </div>

          <h2 className="mt-6 text-sm font-semibold text-ink-800">Horarios disponibles</h2>
          <div className="mt-3">
            <SlotPicker courtId={court.id} slots={slots} />
          </div>
        </div>

        {venue?.lat != null && venue?.lng != null && (
          <div className="card mt-5 animate-fade-up overflow-hidden p-0" style={{ animationDelay: "120ms" }}>
            <h2 className="p-4 pb-0 text-sm font-semibold text-ink-800">Ubicación</h2>
            <iframe
              title={`Mapa de ${court.name}`}
              className="mt-3 h-64 w-full border-0"
              loading="lazy"
              src={`https://www.google.com/maps?q=${venue.lat},${venue.lng}&z=15&output=embed`}
            />
          </div>
        )}
      </div>
    </main>
  );
}
