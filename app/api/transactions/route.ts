import { NextResponse } from "next/server";
import { parseTransactionsAll } from "@/lib/parseTransactions";
import { saveTransactions, recordLoad } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const periodo = String(form.get("periodo") ?? "");
    const cutoff = String(form.get("cutoff") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo de transactions." }, { status: 400 });
    }
    if (!periodo) {
      return NextResponse.json({ error: "Falta el período." }, { status: 400 });
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    const rows = parseTransactionsAll(buf);
    if (rows.length === 0) {
      return NextResponse.json({ error: "El archivo no tiene transacciones legibles." }, { status: 400 });
    }

    await saveTransactions(periodo, rows);
    await recordLoad(periodo, "transactions", {
      cutoffDate: cutoff,
      filename: file.name,
      rowCount: rows.length,
    });
    return NextResponse.json({ count: rows.length, periodo });
  } catch (err) {
    console.error("Error cargando transactions:", err);
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: `No se pudo cargar: ${msg}` }, { status: 500 });
  }
}
