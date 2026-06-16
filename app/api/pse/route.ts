import { NextResponse } from "next/server";
import { parsePse } from "@/lib/parsePse";
import { savePse, recordLoad } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// Carga (aparte) del archivo de recaudo PSE del 7772 ("Transacciones ACH").
// Parsea el Excel y lo guarda por período (reemplaza el anterior). Por ahora
// solo detalle: el cruce con el extracto/facturas se definirá después.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const periodo = String(form.get("periodo") ?? "");
    const cutoff = String(form.get("cutoff") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo de PSE." }, { status: 400 });
    }
    if (!periodo) {
      return NextResponse.json({ error: "Falta el período." }, { status: 400 });
    }
    if (!/\.xlsx?$/.test(file.name.toLowerCase())) {
      return NextResponse.json({ error: "El archivo de PSE debe ser Excel (.xlsx)." }, { status: 400 });
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    const rows = parsePse(buf);
    if (rows.length === 0) {
      return NextResponse.json({ error: "No se encontraron transacciones PSE válidas en el archivo." }, { status: 400 });
    }

    await savePse(periodo, rows);
    await recordLoad(periodo, "pse-7772", {
      cutoffDate: cutoff,
      filename: file.name,
      rowCount: rows.length,
    });

    const aprobadas = rows.filter((r) => /aprob/i.test(r.estado));
    const total = aprobadas.reduce((s, r) => s + r.valor, 0);
    return NextResponse.json({
      ok: true,
      count: rows.length,
      nAprobadas: aprobadas.length,
      total,
    });
  } catch (err) {
    console.error("Error cargando PSE:", err);
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: `No se pudo cargar PSE: ${msg}` }, { status: 500 });
  }
}
