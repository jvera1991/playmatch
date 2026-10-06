import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadAdminData } from "@/lib/admin-data";
import { buildPlayers, PLAYER_SEGMENT_LABEL } from "@/lib/admin-metrics";

// Exporta los jugadores (con los mismos filtros de la pantalla) a CSV.
// Solo admin: contiene datos personales (nombre y WhatsApp), por eso se
// verifica el rol en el servidor y las celdas se neutralizan contra
// inyección de fórmulas al abrir el archivo en Excel.
export const dynamic = "force-dynamic";

function cell(v: string | number | null) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  const segmento = req.nextUrl.searchParams.get("segmento") ?? "";
  const digits = q.replace(/\D/g, "");

  const now = new Date();
  const data = await loadAdminData(supabase, new Date(now.getTime() - 365 * 86_400_000));
  const rows = buildPlayers(data, now).filter(
    (p) =>
      (!segmento || p.segment === segmento) &&
      (!q || p.name.toLowerCase().includes(q) || (digits.length >= 3 && (p.phone ?? "").replace(/\D/g, "").includes(digits)))
  );

  const header = ["Nombre", "WhatsApp", "Estado", "Partidos", "Total pagado (COP)", "Deporte favorito", "Zona", "Última vez", "Registrado"];
  const lines = [header.map(cell).join(",")];
  for (const p of rows) {
    lines.push(
      [
        p.name,
        p.phone,
        PLAYER_SEGMENT_LABEL[p.segment],
        p.played,
        Math.round(p.totalPaid),
        p.sport,
        p.zone,
        p.lastPlayedAt?.slice(0, 10) ?? "",
        p.createdAt.slice(0, 10),
      ]
        .map(cell)
        .join(",")
    );
  }

  const stamp = new Date(now.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jugadores-playmatch-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
