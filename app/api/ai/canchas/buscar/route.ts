import { NextRequest, NextResponse } from "next/server";
import { buscarCanchas, type BuscarCanchasArgs } from "@/lib/ai-tools";

// Endpoint HTTP de la herramienta de búsqueda, para que sistemas EXTERNOS al
// contenedor (ej. el futuro workflow de n8n para WhatsApp) puedan llamarla
// por red. El widget de chat web NO usa este endpoint — llama a la función
// buscarCanchas() directamente desde /api/ai/chat para evitar un self-fetch
// dentro del mismo contenedor (ver comentario en lib/ai-tools.ts).
export async function POST(req: NextRequest) {
  let body: BuscarCanchasArgs;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const resultado = await buscarCanchas(body);
  return NextResponse.json(resultado);
}
