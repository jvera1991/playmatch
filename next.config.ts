import type { NextConfig } from "next";

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
      "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://checkout.wompi.co",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.supabase.co https://maps.gstatic.com https://maps.googleapis.com",
      "connect-src 'self' https://*.supabase.co https://maps.googleapis.com",
      "frame-src 'self' https://checkout.wompi.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
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
