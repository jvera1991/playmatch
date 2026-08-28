import { SoccerBall, Racquet, Volleyball } from "@phosphor-icons/react/ssr";
import type { IconProps } from "@phosphor-icons/react";

// Un solo lugar para el ícono de cada deporte — reemplaza los emojis que se
// usaban antes (⚽ 🎾 🏐) por íconos reales de Phosphor, consistentes en
// trazo y peso en toda la app. "@phosphor-icons/react/dist/ssr" es la
// variante segura para Server Components (no necesita "use client").
export const SPORT_LABEL: Record<string, string> = {
  futbol: "Fútbol 5",
  padel: "Pádel",
  voley: "Vóley",
};

export function SportIcon({
  sport,
  ...props
}: { sport: string } & IconProps) {
  switch (sport) {
    case "futbol":
      return <SoccerBall {...props} />;
    case "padel":
      return <Racquet {...props} />;
    case "voley":
      return <Volleyball {...props} />;
    default:
      return <SoccerBall {...props} />;
  }
}
