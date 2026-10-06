"use client";

import { useActionState } from "react";
import { saveAdminNotes } from "@/app/(admin)/admin/crm-actions";

export function AdminNotesForm({
  profileId,
  kind,
  notes,
  tags,
}: {
  profileId: string;
  kind: "jugadores" | "duenos-y-sedes";
  notes: string;
  tags: string[];
}) {
  const [state, action, pending] = useActionState(saveAdminNotes, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="profile_id" value={profileId} />
      <input type="hidden" name="kind" value={kind} />
      <label className="text-xs font-semibold text-ink-600">
        Etiquetas (separadas por coma)
        <input
          id="an-tags"
          name="tags"
          defaultValue={tags.join(", ")}
          maxLength={400}
          placeholder="seguimiento, pádel"
          className="input mt-1"
        />
      </label>
      <label className="text-xs font-semibold text-ink-600">
        Notas internas
        <textarea
          id="an-notes"
          name="notes"
          defaultValue={notes}
          maxLength={4000}
          rows={6}
          placeholder="Ej.: 02 oct — le escribí, va a ampliar el horario. Revisar el 15."
          className="input mt-1"
        />
      </label>
      <p className="text-xs text-ink-400">Solo el equipo admin ve estas notas. Nunca las ve el jugador ni el dueño.</p>
      {state && (
        <p className={`text-sm font-medium ${state.ok ? "text-brand-700" : "text-red-700"}`} role={state.ok ? "status" : "alert"}>
          {state.ok ? state.message : state.error}
        </p>
      )}
      <button className="btn-primary self-start" disabled={pending}>
        {pending ? "Guardando…" : "Guardar notas"}
      </button>
    </form>
  );
}
