"use client";

import { useEffect, useRef, useState } from "react";
import { ChatCircleDots, X, PaperPlaneTilt, SoccerBall } from "@phosphor-icons/react";

type Msg = { role: "user" | "assistant"; content: string };

const SALUDO: Msg = {
  role: "assistant",
  content: "¡Hola! Soy el asistente de PlayMatch. Cuéntame qué cancha buscas (deporte, zona, fecha) y te ayudo a encontrarla.",
};

const SUGERENCIAS = [
  "Cancha de fútbol hoy en Laureles",
  "Pádel en El Poblado este fin de semana",
  "Vóley barata cerca al centro",
];

// Enlace real hacia una cancha, dentro del texto de la IA, ej. "/canchas/uuid?fecha=...".
// La IA solo devuelve estos links (nunca crea la reserva); los convertimos en <a>.
function renderConLinks(texto: string) {
  const partes = texto.split(/(\/canchas\/[a-zA-Z0-9-]+(?:\?[^\s)]*)?)/g);
  return partes.map((parte, i) =>
    parte.startsWith("/canchas/") ? (
      <a key={i} href={parte} className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2">
        Ver cancha y reservar
      </a>
    ) : (
      <span key={i}>{parte}</span>
    )
  );
}

export function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([SALUDO]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function enviar(texto: string) {
    const contenido = texto.trim();
    if (!contenido || loading) return;

    const nuevos: Msg[] = [...messages, { role: "user", content: contenido }];
    setMessages(nuevos);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nuevos.filter((m) => m !== SALUDO) }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.ok ? data.reply || "No tengo respuesta para eso, ¿puedes reformular?" : data.error,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Se me cayó la conexión. ¿Puedes intentar de nuevo?" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-lift transition-transform hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6"
        aria-label={open ? "Cerrar asistente" : "Abrir asistente PlayMatch"}
      >
        {open ? <X size={24} weight="bold" /> : <ChatCircleDots size={26} weight="fill" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-40 flex h-[28rem] w-[min(92vw,22rem)] flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl sm:bottom-28 sm:right-6">
          <div className="flex items-center gap-2 bg-brand-gradient px-4 py-3 text-white">
            <SoccerBall size={20} weight="fill" />
            <div>
              <p className="text-sm font-semibold leading-tight">Asistente PlayMatch</p>
              <p className="text-[11px] leading-tight text-white/80">Busca canchas al instante</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                  m.role === "user"
                    ? "ml-auto bg-brand-600 text-white"
                    : "mr-auto bg-ink-100 text-ink-800"
                }`}
              >
                {renderConLinks(m.content)}
              </div>
            ))}
            {loading && (
              <div className="mr-auto flex max-w-[85%] gap-1 rounded-2xl bg-ink-100 px-3 py-2.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400" />
              </div>
            )}
          </div>

          {messages.length === 1 && (
            <div className="flex flex-wrap gap-1.5 px-3 pb-2">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  onClick={() => enviar(s)}
                  className="rounded-full border border-ink-200 px-2.5 py-1 text-[11px] text-ink-600 transition-colors hover:border-brand-400 hover:text-brand-700"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviar(input);
            }}
            className="flex items-center gap-2 border-t border-ink-100 p-2.5"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe qué cancha buscas..."
              maxLength={800}
              className="flex-1 rounded-full border border-ink-200 bg-ink-50 px-3.5 py-2 text-sm outline-none focus:border-brand-500"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white disabled:opacity-40"
              aria-label="Enviar"
            >
              <PaperPlaneTilt size={16} weight="fill" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
