import { NextResponse } from "next/server";
import { addMovementFlag, removeMovementFlag } from "@/lib/db";

export const runtime = "nodejs";

// POST: marca un movimiento como recaudo. DELETE: lo desmarca (vuelve a otros ingresos).
export async function POST(req: Request) {
  try {
    const { period, accountId, sig } = await req.json();
    if (!period || !accountId || !sig) throw new Error("Faltan period/accountId/sig");
    await addMovementFlag(period, accountId, sig);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { period, accountId, sig } = await req.json();
    if (!period || !accountId || !sig) throw new Error("Faltan period/accountId/sig");
    await removeMovementFlag(period, accountId, sig);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
