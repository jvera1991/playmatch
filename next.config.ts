import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // clave para correr liviano en Docker en el VPS
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
