import type { Metadata } from "next";
import "./globals.css";
import { AiChatWidget } from "@/components/ai-chat-widget";

export const metadata: Metadata = {
  title: "Playmatch: Reserva canchas en Medellín",
  description: "Reserva canchas sintéticas de fútbol, pádel y vóley en Medellín, al instante.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-ink-50 font-sans text-ink-900 antialiased">
        {children}
        <AiChatWidget />
      </body>
    </html>
  );
}
