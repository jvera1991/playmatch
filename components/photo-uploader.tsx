"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_FOTOS = 6;
const MAX_MB = 5;

export interface CourtPhoto {
  id: string;
  url: string;
  sort_order: number;
}

export function PhotoUploader({
  courtId,
  initialPhotos,
  onSaved,
  onDeleted,
}: {
  courtId: string;
  initialPhotos: CourtPhoto[];
  onSaved: (photo: { path: string; url: string }) => Promise<void>;
  onDeleted: (photoId: string, path: string) => Promise<void>;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setError(null);

    if (photos.length + files.length > MAX_FOTOS) {
      setError(`Máximo ${MAX_FOTOS} fotos por cancha.`);
      return;
    }

    setUploading(true);
    const supabase = createClient();

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setError("Solo se permiten imágenes (JPG, PNG, WEBP).");
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(`Cada foto debe pesar menos de ${MAX_MB}MB.`);
        continue;
      }

      const ext = file.name.split(".").pop() || "jpg";
      const path = `${courtId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("court-photos")
        .upload(path, file, { upsert: false });

      if (uploadError) {
        setError(`No se pudo subir ${file.name}: ${uploadError.message}`);
        continue;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("court-photos").getPublicUrl(path);

      await onSaved({ path, url: publicUrl });
    }

    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    startTransition(() => {
      // Refresca la lista visible pidiendo al padre que vuelva a renderizar
      // (el server action ya hizo revalidatePath). Como esto es un client
      // component, simplemente recargamos con router.refresh vía location.
      window.location.reload();
    });
  }

  async function handleDelete(photo: CourtPhoto, path: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    await onDeleted(photo.id, path);
  }

  return (
    <div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 bg-white p-8 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/30"
      >
        <span className="text-3xl">📷</span>
        <p className="font-medium text-ink-700">
          {uploading || isPending ? "Subiendo..." : "Arrastra fotos aquí o haz clic para elegir"}
        </p>
        <p className="text-xs text-ink-400">
          Hasta {MAX_FOTOS} fotos, máximo {MAX_MB}MB cada una (JPG, PNG, WEBP)
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {photos.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => {
            const path = new URL(photo.url).pathname.split("/court-photos/")[1];
            return (
              <div key={photo.id} className="group relative overflow-hidden rounded-xl border border-ink-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="" className="h-32 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => handleDelete(photo, path)}
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Eliminar foto"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
