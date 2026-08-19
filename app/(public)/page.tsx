import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/navbar";
import { CourtCard } from "@/components/court-card";

const DEPORTES = [
  { value: "futbol", label: "Fútbol 5", emoji: "⚽" },
  { value: "padel", label: "Pádel", emoji: "🎾" },
  { value: "voley", label: "Vóley", emoji: "🏐" },
] as const;

export default async function HomePage() {
  const supabase = await createClient();

  const { data: courts } = await supabase
    .from("courts")
    .select(
      "id, name, sport, size, is_covered, price_per_hour, venues(name, neighborhood, city), court_photos(url)"
    )
    .eq("is_active", true)
    .eq("is_approved", true)
    .limit(9);

  return (
    <main>
      <Navbar />

      <section className="relative overflow-hidden bg-brand-glow">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:pt-24">
          <div className="animate-fade-up">
            <span className="badge border border-brand-200 bg-white text-brand-700">
              🏟️ Medellín
            </span>
            <h1 className="mt-4 max-w-2xl text-4xl font-extrabold tracking-tight text-ink-900 sm:text-5xl">
              Reserva tu cancha en{" "}
              <span className="bg-brand-gradient bg-clip-text text-transparent">segundos</span>
            </h1>
            <p className="mt-3 max-w-lg text-lg text-ink-600">
              Fútbol sintético, pádel y vóley. Disponibilidad en tiempo real, pago seguro,
              sin llamadas ni WhatsApp de ida y vuelta.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {DEPORTES.map((d) => (
                <Link
                  key={d.value}
                  href={`/buscar?deporte=${d.value}`}
                  className="group flex items-center gap-2 rounded-2xl border border-ink-100 bg-white px-5 py-3 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
                >
                  <span className="text-xl transition-transform duration-300 group-hover:scale-125">
                    {d.emoji}
                  </span>
                  <span className="font-medium text-ink-800">{d.label}</span>
                </Link>
              ))}
              <Link href="/buscar" className="btn-secondary">
                Ver todas →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-bold text-ink-900">Canchas destacadas</h2>
          <Link href="/buscar" className="text-sm font-medium text-brand-700 hover:underline">
            Ver todas
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courts?.map((court, i) => (
            <CourtCard key={court.id} court={court as never} index={i} />
          ))}
          {!courts?.length && (
            <div className="card col-span-full flex flex-col items-center gap-3 py-16 text-center">
              <span className="text-4xl">🌱</span>
              <p className="text-ink-500">
                Todavía no hay canchas publicadas. ¡Sé el primer dueño en publicar la tuya!
              </p>
              <Link href="/registro" className="btn-primary">
                Publicar mi cancha
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
