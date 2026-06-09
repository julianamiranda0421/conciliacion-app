import { NextResponse } from "next/server";
import { saveObservation } from "@/lib/db";

export const runtime = "nodejs";

// POST: guarda (o actualiza) la observación de una partida conciliada.
export async function POST(req: Request) {
  try {
    const { period, accountId, transactionId, texto } = await req.json();
    if (!period || !accountId || !transactionId) throw new Error("Faltan period/accountId/transactionId");
    await saveObservation(period, accountId, Number(transactionId), String(texto ?? ""));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
