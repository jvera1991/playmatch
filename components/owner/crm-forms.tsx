"use client";

import { useActionState, useState } from "react";
import { createCustomer, saveCustomerNotes, type ActionResult } from "@/app/(owner)/panel/crm-actions";

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? (
    <p className="text-sm font-medium text-brand-700" role="status">
      {state.message}
    </p>
  ) : (
    <p className="text-sm font-medium text-red-700" role="alert">
      {state.error}
    </p>
  );
}

export function AddCustomerButton() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createCustomer, null);

  return (
    <div className="relative">
      <button type="button" className="btn-primary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        + Agregar cliente
      </button>
      {open && (
        <form
          action={action}
          className="absolute right-0 top-full z-20 mt-2 flex w-72 flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-4 shadow-lift"
        >
          <label className="text-xs font-semibold text-ink-600">
            Nombre
            <input id="nc-name" name="full_name" required maxLength={120} className="input mt-1" />
          </label>
          <label className="text-xs font-semibold text-ink-600">
            WhatsApp
            <input id="nc-phone" name="phone" inputMode="tel" maxLength={30} placeholder="300 123 4567" className="input mt-1" />
          </label>
          <Feedback state={state} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary !px-3 !py-2 text-sm" onClick={() => setOpen(false)}>
              Cerrar
            </button>
            <button className="btn-primary !px-3 !py-2 text-sm" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function CustomerNotesForm({ customerKey, notes, tags }: { customerKey: string; notes: string | null; tags: string[] }) {
  const [state, action, pending] = useActionState(saveCustomerNotes, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="key" value={customerKey} />
      <label className="text-xs font-semibold text-ink-600">
        Etiquetas (separadas por coma)
        <input
          id="cn-tags"
          name="tags"
          defaultValue={tags.join(", ")}
          maxLength={400}
          placeholder="Equipo empresa, paga en efectivo"
          className="input mt-1"
        />
      </label>
      <label className="text-xs font-semibold text-ink-600">
        Notas privadas
        <textarea
          id="cn-notes"
          name="notes"
          defaultValue={notes ?? ""}
          maxLength={2000}
          rows={5}
          placeholder="Ej.: organiza el partido de su oficina, pide balón extra…"
          className="input mt-1"
        />
      </label>
      <p className="text-xs text-ink-400">Solo tú ves estas notas. El cliente no las ve.</p>
      <Feedback state={state} />
      <button className="btn-primary self-start" disabled={pending}>
        {pending ? "Guardando…" : "Guardar notas"}
      </button>
    </form>
  );
}
