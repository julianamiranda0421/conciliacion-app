import { NextResponse } from "next/server";
import { fetchBills360 } from "@/lib/metabase";
import { saveBills360, getBills360Summary, recordLoad } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST: trae la cartera 360 desde Metabase y la guarda en Supabase (refresco completo).
export async function POST() {
  try {
    const rows = await fetchBills360();
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Metabase no devolvió filas. ¿El card 75703 tiene el filtro de 2026?" },
        { status: 400 },
      );
    }
    const count = await saveBills360(rows);
    await recordLoad("360", "bills_360", {
      cutoffDate: null,
      filename: "metabase:card-75703",
      rowCount: count,
    });
    const summary = await getBills360Summary();
    return NextResponse.json({ count, summary });
  } catch (err) {
    console.error("Error sincronizando bills_360:", err);
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: `No se pudo sincronizar: ${msg}` }, { status: 500 });
  }
}

// GET: resumen actual de lo que hay en Supabase (sin tocar Metabase).
export async function GET() {
  try {
    const summary = await getBills360Summary();
    return NextResponse.json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
