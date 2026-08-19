// Formatos/tamaños de cancha por deporte, para que un jugador sepa qué
// esperar antes de reservar (una cancha de fútbol 5 vs 5 es muy distinta a
// una de 11 vs 11).
export const COURT_SIZES: Record<string, string[]> = {
  futbol: ["5 vs 5", "7 vs 7", "9 vs 9", "11 vs 11"],
  padel: ["Individual (1 vs 1)", "Dobles (2 vs 2)"],
  voley: ["Vóley playa (2 vs 2)", "Vóley sala (6 vs 6)"],
};
