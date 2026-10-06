import type { OwnerHealth, PlayerSegment } from "@/lib/admin-metrics";

export const SEGMENT_STYLE: Record<PlayerSegment, string> = {
  frecuente: "bg-brand-100 text-brand-800",
  nuevo: "bg-sky-100 text-sky-800",
  en_riesgo: "bg-amber-100 text-amber-800",
  inactivo: "bg-ink-100 text-ink-600",
  ocasional: "bg-ink-100 text-ink-600",
  sin_reservar: "bg-ink-100 text-ink-600",
};

export const HEALTH_STYLE: Record<OwnerHealth, string> = {
  activo: "bg-brand-100 text-brand-800",
  nuevo: "bg-sky-100 text-sky-800",
  en_riesgo: "bg-amber-100 text-amber-800",
  dormido: "bg-ink-100 text-ink-600",
};
