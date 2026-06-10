import { NextResponse } from "next/server";
import { parseAdquirencias } from "@/lib/parseAdquirencias";
import { saveAdquirencias, recordLoad } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// Carga (aparte) del archivo de adquirencias TC del 7772. Parsea el Excel y lo
// guarda por período (reemplaza el anterior). La conciliación se recalcula en vivo
// en la página del 7772.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const periodo = String(form.get("periodo") ?? "");
    const cutoff = String(form.get("cutoff") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo de adquirencias." }, { status: 400 });
    }
    if (!periodo) {
      return NextResponse.json({ error: "Falta el período." }, { status: 400 });
    }
    if (!/\.xlsx?$/.test(file.name.toLowerCase())) {
      return NextResponse.json({ error: "El archivo de adquirencias debe ser Excel (.xlsx)." }, { status: 400 });
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    const rows = parseAdquirencias(buf);
    if (rows.length === 0) {
      return NextResponse.json({ error: "No se encontraron filas válidas en el archivo." }, { status: 400 });
    }

    await saveAdquirencias(periodo, rows);
    await recordLoad(periodo, "adquirencias-7772", {
      cutoffDate: cutoff,
      filename: file.name,
      rowCount: rows.length,
    });

    const consumo = rows.reduce((s, r) => s + r.consumo, 0);
    const neto = rows.reduce((s, r) => s + r.neto, 0);
    return NextResponse.json({
      ok: true,
      count: rows.length,
      consumo,
      neto,
      comision: consumo - neto,
    });
  } catch (err) {
    console.error("Error cargando adquirencias:", err);
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: `No se pudo cargar adquirencias: ${msg}` }, { status: 500 });
  }
}
