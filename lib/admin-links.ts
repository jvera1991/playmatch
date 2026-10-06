// Menú del panel admin (06/10/2026). Los páginas nuevas (Jugadores, Dueños y
// sedes) usan esta lista; las páginas anteriores conservan la suya con las dos
// entradas nuevas agregadas al final.
export const ADMIN_LINKS = [
  { href: "/admin", label: "Resumen", icon: "📊" },
  { href: "/admin/duenos", label: "Dueños pendientes", icon: "🧑‍💼" },
  { href: "/admin/canchas", label: "Canchas", icon: "🏟️" },
  { href: "/admin/reservas", label: "Reservas", icon: "📅" },
  { href: "/admin/pagos", label: "Pagos a dueños", icon: "💸" },
  { href: "/admin/jugadores", label: "Jugadores", icon: "👥" },
  { href: "/admin/duenos-y-sedes", label: "Dueños y sedes", icon: "🏢" },
];
