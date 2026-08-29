import type { NextRequest } from "next/server";

// Rate limiter simple en memoria (ventana deslizante), pensado para el
// asistente de IA público (sin sesión de usuario para identificar quién
// pega). No usa Redis a propósito: Playmatch corre en un solo contenedor/
// instancia (ver CLAUDE.md, sección de despliegue) — si en el futuro se
// escala a más de una instancia detrás de un balanceador, este limiter deja
// de ser confiable (cada instancia cuenta aparte) y hay que migrar a un
// store compartido (ej. Redis/Upstash).
//
// También se resetea en cada redeploy (vive solo en memoria del proceso),
// lo cual es aceptable para este caso de uso: el objetivo es frenar abuso
// sostenido en tiempo real, no llevar una cuenta histórica.

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

// Limpieza periódica para no acumular memoria indefinidamente con IPs que ya
// no vuelven a pegarle al endpoint.
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
    if (!bucket.timestamps.length) buckets.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): { allowed: boolean; retryAfterSeconds: number } {
  cleanup(windowMs);
  const now = Date.now();
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    buckets.set(key, bucket);
    return { allowed: false, retryAfterSeconds };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { allowed: true, retryAfterSeconds: 0 };
}

// EasyPanel/Traefik corre como proxy reverso delante de la app — el request
// que Next.js recibe trae la IP real del visitante en X-Forwarded-For (o
// X-Real-IP), no en la conexión TCP directa. Si esos headers no llegan
// (proxy mal configurado), todo el tráfico cae en la misma clave "unknown"
// y el límite se vuelve global en vez de por-IP — sigue siendo una defensa
// razonable (frena abuso sostenido igual), pero conviene revisar los logs
// si un usuario legítimo reporta que le sale "demasiadas solicitudes".
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
