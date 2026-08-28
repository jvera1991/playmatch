import Link from "next/link";
import { MapPin, Plant, ShieldCheck, Clock } from "@phosphor-icons/react/ssr";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/navbar";
import { CourtCard } from "@/components/court-card";
import { SportIcon, SPORT_LABEL } from "@/components/sport-icon";
import { HowItWorks } from "@/components/how-it-works";

const DEPORTES = ["futbol", "padel", "voley"] as const;

// Foto editorial del hero — cancha sintética iluminada de noche (Unsplash,
// licencia libre). Placeholder mientras se acumulan fotos reales de canchas
// publicadas; cuando haya suficientes se puede reemplazar por un mosaico de
// fotos reales subidas por los dueños.
const HERO_PHOTO =
  "https://images.unsplash.com/photo-1671209151455-86980f5bf293?w=1200&q=80&auto=format&fit=crop";

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
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-16 pt-16 sm:pt-20 lg:grid-cols-2 lg:pb-24 lg:pt-20">
          <div className="animate-fade-up">
            <span className="badge inline-flex items-center gap-1 border border-brand-200 bg-white text-brand-700">
              <MapPin weight="fill" size={13} /> Medellín
            </span>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-ink-900 sm:text-5xl">
              Reserva tu cancha en{" "}
              <span className="bg-brand-gradient bg-clip-text text-transparent">segundos</span>
            </h1>
            <p className="mt-3 max-w-md text-lg text-ink-600">
              Fútbol sintético, pádel y vóley en Medellín. Disponibilidad real, pago seguro,
              sin llamadas ni WhatsApp de ida y vuelta.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {DEPORTES.map((sport) => (
                <Link
                  key={sport}
                  href={`/buscar?deporte=${sport}`}
                  className="group flex items-center gap-2 rounded-2xl border border-ink-100 bg-white px-5 py-3 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
                >
                  <SportIcon
                    sport={sport}
                    weight="duotone"
                    size={22}
                    className="text-brand-600 transition-transform duration-300 group-hover:scale-110"
                  />
                  <span className="font-medium text-ink-800">{SPORT_LABEL[sport]}</span>
                </Link>
              ))}
              <Link href="/buscar" className="btn-secondary">
                Ver todas
              </Link>
            </div>
          </div>

          <div className="relative animate-fade-in [animation-delay:150ms]">
            <div className="relative overflow-hidden rounded-3xl shadow-lift">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={HERO_PHOTO}
                alt="Cancha sintética iluminada"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-5 -left-5 hidden items-center gap-2.5 rounded-2xl border border-ink-100 bg-white/95 px-4 py-3 shadow-lift backdrop-blur sm:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <ShieldCheck weight="fill" size={18} />
              </span>
              <div className="text-xs">
                <p className="font-semibold text-ink-900">Pago 100% seguro</p>
                <p className="text-ink-400">Cupo confirmado al instante</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <h2 className="text-xl font-bold text-ink-900">Cómo funciona</h2>
        <p className="mt-1.5 max-w-md text-sm text-ink-500">
          De buscar a jugar, en tres pasos.
        </p>
        <div className="mt-6">
          <HowItWorks />
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
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Plant weight="duotone" size={28} />
              </span>
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

      <section className="border-t border-ink-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <Clock weight="duotone" size={24} />
          </span>
          <h2 className="text-xl font-bold text-ink-900">¿Tienes una cancha?</h2>
          <p className="max-w-sm text-sm text-ink-500">
            Publícala gratis y empieza a recibir reservas en línea, sin depender de llamadas.
          </p>
          <Link href="/registro" className="btn-primary mt-1">
            Publicar mi cancha
          </Link>
        </div>
      </section>
    </main>
  );
}
