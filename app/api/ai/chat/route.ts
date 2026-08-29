import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { buscarCanchas } from "@/lib/ai-tools";

// Endpoint del asistente conversacional "PlayMatch AI" (widget web).
//
// Reglas de seguridad/diseño explícitas:
// 1. La IA NUNCA tiene acceso directo a la base de datos ni crea reservas.
//    Solo puede llamar a la herramienta "buscar_canchas", que ejecuta
//    buscarCanchas() de lib/ai-tools.ts DIRECTAMENTE (sin fetch de red) —
//    el mismo cálculo de disponibilidad que usan las páginas públicas.
//    Cualquier afirmación sobre horarios/precios DEBE venir de una llamada a
//    la herramienta, nunca inventada.
// 2. Para reservar, la IA siempre entrega el link real a /canchas/[id],
//    donde el usuario completa la reserva por el flujo ya existente y
//    validado (con su sesión, el candado de 15 min y la restricción
//    anti-doble-reserva a nivel de base de datos). La IA jamás escribe.
// 3. No se guarda historial en servidor: el cliente reenvía los mensajes
//    previos en cada request (conversación sin estado en el backend).

const MAX_MESSAGES = 20;
const MAX_TOOL_ROUNDS = 4;

const SYSTEM_PROMPT = `Eres el asistente de PlayMatch, una plataforma tipo Airbnb para reservar canchas sintéticas de fútbol, pádel y vóley en Medellín, Colombia.

Reglas estrictas:
- NUNCA inventes disponibilidad, horarios ni precios. Toda esa información debe venir de la herramienta buscar_canchas. Si no has llamado la herramienta para lo que te preguntan, llámala primero.
- NUNCA digas que "reservaste" o "aparté" una cancha. Tú no puedes crear reservas. Cuando el usuario quiera reservar, dale el link de la cancha (campo "url" de cada resultado) para que complete el pago ahí mismo.
- Si el usuario no da fecha, asume hoy en Medellín.
- Sé breve, cálido y directo, en español colombiano informal pero respetuoso (tutea). Evita párrafos largos.
- Si buscar_canchas no devuelve resultados, dilo con honestidad y sugiere ajustar el filtro (otro barrio, otro deporte, otra fecha).
- No dependas de saber los "ids" internos de comuna: puedes escribir el nombre del barrio o zona (ej. "El Poblado", "Laureles") y la herramienta lo interpreta.`;

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "buscar_canchas",
      description:
        "Busca canchas deportivas disponibles en Medellín con disponibilidad real calculada para una fecha dada. Usa esto para CUALQUIER pregunta sobre canchas, horarios, precios o zonas.",
      parameters: {
        type: "object",
        properties: {
          deporte: {
            type: "string",
            enum: ["futbol", "padel", "voley"],
            description: "Deporte buscado. Omitir si el usuario no especificó.",
          },
          comuna: {
            type: "string",
            description: 'Zona o comuna, en lenguaje natural, ej. "El Poblado", "Laureles", "Belén".',
          },
          barrio: { type: "string", description: "Barrio específico, si el usuario lo menciona." },
          fecha: {
            type: "string",
            description: 'Fecha en formato YYYY-MM-DD. Si el usuario dice "hoy" o no especifica, omitir este campo.',
          },
          precio_max: { type: "number", description: "Precio máximo por hora en pesos colombianos (COP)." },
        },
      },
    },
  },
];

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "El asistente de IA todavía no está configurado en el servidor." },
      { status: 503 }
    );
  }

  let body: { messages?: { role: "user" | "assistant"; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const incoming = (body.messages ?? []).filter(
    (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
  );

  if (!incoming.length) {
    return NextResponse.json({ error: "Falta el mensaje del usuario" }, { status: 400 });
  }

  // Límite defensivo: no dejamos crecer el contexto sin control ni gastar
  // tokens de más (el cliente reenvía todo el historial en cada turno).
  const trimmed = incoming.slice(-MAX_MESSAGES);

  const openai = new OpenAI({ apiKey });

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...trimmed.map((m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam),
  ];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools,
        temperature: 0.4,
      });

      const choice = completion.choices[0];
      const msg = choice.message;

      if (!msg.tool_calls || !msg.tool_calls.length) {
        return NextResponse.json({ reply: msg.content ?? "" });
      }

      messages.push(msg);

      for (const call of msg.tool_calls) {
        if (call.type !== "function") continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }

        const result =
          call.function.name === "buscar_canchas"
            ? await buscarCanchas(args)
            : { error: "Herramienta desconocida" };

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    return NextResponse.json({
      reply: "Estoy teniendo dificultades para responder ahora mismo. ¿Puedes intentar de nuevo?",
    });
  } catch (err) {
    // Log real del error (antes se perdía en silencio) para poder diagnosticar
    // desde los logs de EasyPanel si el asistente vuelve a fallar.
    console.error("[/api/ai/chat] error:", err);
    return NextResponse.json(
      { error: "El asistente de IA no está disponible en este momento." },
      { status: 502 }
    );
  }
}
