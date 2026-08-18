// Calcula las franjas de 1 hora disponibles para una cancha en una fecha dada,
// cruzando: horario semanal del dueño (court_schedules) - cierres puntuales
// (court_closures) - reservas ya hechas (bookings pending_payment/confirmed).
//
// Nota: usa horas locales de Colombia (America/Bogota, UTC-5 todo el año, sin
// horario de verano) — por eso no usamos date-fns-tz aquí, el offset es fijo.

export interface Slot {
  start: Date;
  end: Date;
  available: boolean;
}

const BOGOTA_OFFSET_HOURS = -5;

export function getAvailableSlots({
  dateStr, // "YYYY-MM-DD" en hora de Colombia
  slotMinutes,
  schedules, // [{ day_of_week, open_time: "HH:MM:SS", close_time }]
  closures, // [{ start_at, end_at }] ISO
  bookings, // [{ start_at, end_at }] ISO — solo pending_payment/confirmed
}: {
  dateStr: string;
  slotMinutes: number;
  schedules: { day_of_week: number; open_time: string; close_time: string }[];
  closures: { start_at: string; end_at: string }[];
  bookings: { start_at: string; end_at: string }[];
}): Slot[] {
  const [year, month, day] = dateStr.split("-").map(Number);
  const dateUTCNoon = new Date(Date.UTC(year, month - 1, day, 12));
  const dayOfWeek = dateUTCNoon.getUTCDay();

  const todaySchedules = schedules.filter((s) => s.day_of_week === dayOfWeek);
  if (!todaySchedules.length) return [];

  const toBogotaDate = (hms: string) => {
    const [h, m] = hms.split(":").map(Number);
    // Hora local Colombia -> UTC: sumamos 5 horas (UTC-5)
    return new Date(Date.UTC(year, month - 1, day, h - BOGOTA_OFFSET_HOURS, m));
  };

  const slots: Slot[] = [];

  for (const schedule of todaySchedules) {
    let cursor = toBogotaDate(schedule.open_time);
    const closeAt = toBogotaDate(schedule.close_time);

    while (cursor.getTime() + slotMinutes * 60_000 <= closeAt.getTime()) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor.getTime() + slotMinutes * 60_000);

      const blockedByClosure = closures.some(
        (c) => new Date(c.start_at) < slotEnd && new Date(c.end_at) > slotStart
      );
      const blockedByBooking = bookings.some(
        (b) => new Date(b.start_at) < slotEnd && new Date(b.end_at) > slotStart
      );

      slots.push({
        start: slotStart,
        end: slotEnd,
        available: !blockedByClosure && !blockedByBooking,
      });

      cursor = slotEnd;
    }
  }

  return slots;
}
