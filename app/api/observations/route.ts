import { NextResponse } from "next/server";
import { saveObservation, saveDevObservation } from "@/lib/db";

export const runtime = "nodejs";

// POST: guarda (o actualiza) una observación.
//  - Partida conciliada: { period, accountId, transactionId, texto } (clave transaction_id).
//  - Cheque devuelto:     { period, accountId, documento, texto }     (clave documento).
export async function POST(req: Request) {
  try {
    const { period, accountId, transactionId, documento, texto } = await req.json();
    if (!period || !accountId) throw new Error("Faltan period/accountId");
    if (documento != null && documento !== "") {
      await saveDevObservation(period, accountId, String(documento), String(texto ?? ""));
    } else if (transactionId) {
      await saveObservation(period, accountId, Number(transactionId), String(texto ?? ""));
    } else {
      throw new Error("Falta transactionId o documento");
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
