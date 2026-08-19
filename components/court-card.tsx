import Link from "next/link";

const SPORT_LABEL: Record<string, string> = {
  futbol: "Fútbol 5",
  padel: "Pádel",
  voley: "Vóley",
};

const SPORT_EMOJI: Record<string, string> = {
  futbol: "⚽",
  padel: "🎾",
  voley: "🏐",
};

export function CourtCard({
  court,
  index = 0,
}: {
  court: {
    id: string;
    name: string;
    sport: string;
    price_per_hour: number;
    size?: string | null;
    is_covered?: boolean | null;
    venues: { name: string; neighborhood: string | null; city: string } | null;
    court_photos?: { url: string }[] | null;
  };
  index?: number;
}) {
  const photoUrl = court.court_photos?.[0]?.url;

  return (
    <Link
      href={`/canchas/${court.id}`}
      style={{ animationDelay: `${index * 60}ms` }}
      className="card group animate-fade-up overflow-hidden p-0 hover:-translate-y-1 hover:shadow-lift"
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={court.name}
          className="h-32 w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-32 items-center justify-center bg-brand-gradient text-5xl">
          <span className="drop-shadow-sm transition-transform duration-300 group-hover:scale-110">
            {SPORT_EMOJI[court.sport] ?? "🏟️"}
          </span>
        </div>
      )}
      <div className="p-4">
        <div className="flex flex-wrap gap-1.5">
          <p className="badge bg-brand-50 text-brand-700">{SPORT_LABEL[court.sport] ?? court.sport}</p>
          {court.size && <p className="badge bg-ink-100 text-ink-600">{court.size}</p>}
          {court.is_covered && <p className="badge bg-sky-50 text-sky-700">☂️ Techada</p>}
        </div>
        <h3 className="mt-2 font-semibold text-ink-900">{court.name}</h3>
        <p className="text-sm text-ink-400">
          {court.venues?.neighborhood ? `${court.venues.neighborhood}, ` : ""}
          {court.venues?.city}
        </p>
        <p className="mt-3 font-semibold text-brand-700">
          ${court.price_per_hour.toLocaleString("es-CO")}{" "}
          <span className="text-xs font-normal text-ink-400">/ hora</span>
        </p>
      </div>
    </Link>
  );
}
