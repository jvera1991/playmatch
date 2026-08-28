"use client";

import { MagnifyingGlass, CalendarCheck, ShieldCheck, type Icon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";

const PASOS: { icon: Icon; title: string; body: string }[] = [
  {
    icon: MagnifyingGlass,
    title: "Busca tu cancha",
    body: "Filtra por deporte, zona de Medellín y horario. Ves precio y disponibilidad real al instante.",
  },
  {
    icon: CalendarCheck,
    title: "Reserva en línea",
    body: "Eliges el horario en el calendario y confirmas, sin llamadas ni esperar respuesta por WhatsApp.",
  },
  {
    icon: ShieldCheck,
    title: "Juega tranquilo",
    body: "Tu cupo queda confirmado al instante. Si algo cambia, puedes cancelar hasta 3 horas antes.",
  },
];

// Revelado en scroll con propósito narrativo: los tres pasos aparecen en
// secuencia para reforzar que es un proceso de 1-2-3, no una lista plana.
export function HowItWorks() {
  const reduce = useReducedMotion();

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.3fr_1fr_1fr]">
      {PASOS.map((paso, i) => {
        const Icon = paso.icon;
        const featured = i === 0;
        return (
          <motion.div
            key={paso.title}
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            className={
              featured
                ? "flex flex-col justify-between rounded-2xl bg-brand-gradient p-6 text-white shadow-lift"
                : "rounded-2xl border border-ink-100 bg-white p-6"
            }
          >
            <div>
              <span
                className={
                  featured
                    ? "flex h-11 w-11 items-center justify-center rounded-xl bg-white/20"
                    : "flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700"
                }
              >
                <Icon weight="duotone" size={24} />
              </span>
              <h3 className={featured ? "mt-4 text-lg font-bold" : "mt-4 text-lg font-bold text-ink-900"}>
                {paso.title}
              </h3>
              <p className={featured ? "mt-1.5 text-sm text-white/85" : "mt-1.5 text-sm text-ink-500"}>
                {paso.body}
              </p>
            </div>
            <span
              className={
                featured
                  ? "mt-6 text-5xl font-black text-white/25"
                  : "mt-6 block text-5xl font-black text-ink-100"
              }
            >
              0{i + 1}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
