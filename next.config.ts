import type { NextConfig } from "next";

// Origen de las teselas del mapa (components/map-view.tsx). Si se cambia de
// proveedor con NEXT_PUBLIC_MAP_TILE_URL, el CSP se ajusta solo.
const MAP_TILE_ORIGIN = (() => {
  const url = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  try {
    const { protocol, hostname } = new URL(url.replace(/\{[a-z]\}/g, "a"));
    return `${protocol}//${hostname.replace(/^a\./, "*.")}`;
  } catch {
    return "https://tile.openstreetmap.org";
  }
})();

const securityHeaders = [
  // Evita que el sitio se cargue dentro de un <iframe> ajeno (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Evita que el navegador intente "adivinar" el tipo de un archivo servido.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No manda la URL completa como referrer a sitios externos.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Fuerza HTTPS en el navegador durante 2 años una vez visitado por HTTPS.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },
  // CSP: solo recursos propios + lo que la app realmente usa (Google Maps,
  // fotos de Supabase Storage, Wompi checkout). "unsafe-inline" en style-src
  // porque Next.js inyecta estilos inline; "unsafe-eval" no se incluye.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Google Maps se retiró del navegador (06/10/2026): el mapa ahora es
      // Leaflet + teselas de OpenStreetMap, que solo necesitan img-src.
      "script-src 'self' 'unsafe-inline' https://checkout.wompi.co",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      `img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com ${MAP_TILE_ORIGIN}`,
      "connect-src 'self' https://*.supabase.co",
      "frame-src 'self' https://checkout.wompi.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // object-src 'none': bloquea <object>/<embed>/<applet> por completo (no
      // los usamos para nada). Sin esto, un atacante que lograra inyectar HTML
      // podría cargar un plugin (ej. Flash/PDF viewer) para ejecutar código,
      // sorteando restricciones de script-src. Hallazgo de un scan externo
      // (Argus, 01/10/2026) — costo cero porque la app no usa esos tags.
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone", // clave para correr liviano en Docker en el VPS
  poweredByHeader: false, // no revelar "X-Powered-By: Next.js" al backend
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
