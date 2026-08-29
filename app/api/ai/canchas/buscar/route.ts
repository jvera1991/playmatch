import { NextRequest, NextResponse } from "next/server";
import { buscarCanchas, type BuscarCanchasArgs } from "@/lib/ai-tools";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Endpoint HTTP de la herramienta de búsqueda, para que sistemas EXTERNOS al
// contenedor (ej. el futuro workflow de n8n para WhatsApp) puedan llamarla
// por red. El widget de chat web NO usa este endpoint — llama a la función
// buscarCanchas() directamente desde /api/ai/chat para evitar un self-fetch
// dentro del mismo contenedor (ver comentario en lib/ai-tools.ts).
//
// Sigue siendo un endpoint público sin autenticación (info de canchas es
// pública), así que también lleva su propio rate limit — más generoso que
// el del chat porque una sola búsqueda de un sistema externo (n8n) puede
// implicar varias llamadas seguidas, pero igual limitado para que no sea un
// vector de scraping/DoS contra Supabase.
const RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 };

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rate = checkRateLimit(`ai-buscar:${ip}`, RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta de nuevo en unos minutos." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  let body: BuscarCanchasArgs;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const resultado = await buscarCanchas(body);
  return NextResponse.json(resultado);
}
