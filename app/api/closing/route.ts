import { NextResponse } from "next/server";
import { getAccount } from "@/lib/banks";
import {
  getBankMovements,
  getClosing,
  saveClosing,
  approveClosing,
  reopenClosing,
  type ClosingValues,
} from "@/lib/db";
import { computeMovTotals, saldoActual } from "@/lib/closing";

export const runtime = "nodejs";

// Usuario que aprueba. La app tiene un único usuario de finanzas (no hay login),
// así que se registra fijo para dejar traza de quién cerró el mes.
const APROBADO_POR = "finanzas@bia.app";

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// POST: guarda el saldo inicial, aprueba o reabre el cierre de un período/cuenta.
//  body: { period, accountId, action: "save" | "approve" | "reopen", saldoInicial }
// Los ingresos/egresos SIEMPRE se recalculan en el servidor desde bank_movements
// (no se confía en el cliente). El saldo actual = saldo inicial + ingresos − egresos.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const period = String(body.period ?? "");
    const accountId = String(body.accountId ?? "");
    const action = String(body.action ?? "save");

    if (!period || !accountId) throw new Error("Faltan period/accountId");
    if (!getAccount(accountId)) throw new Error("Cuenta desconocida");

    if (action === "reopen") {
      await reopenClosing(period, accountId);
      return NextResponse.json({ ok: true, closing: await getClosing(period, accountId) });
    }

    const saldoInicial = toNum(body.saldoInicial);
    // Los ingresos/egresos NO se recalculan al editar el saldo: se conservan los del
    // cierre (que vienen del encabezado del extracto al cargar). Solo si aún no existen
    // se suman los movimientos como respaldo.
    const existing = await getClosing(period, accountId);
    let ingresos: number;
    let egresos: number;
    if (existing?.ingresos != null && existing?.egresos != null) {
      ingresos = existing.ingresos;
      egresos = existing.egresos;
    } else {
      const totals = computeMovTotals(await getBankMovements(period, accountId));
      ingresos = totals.ingresos;
      egresos = totals.egresos;
    }
    const vals: ClosingValues = {
      saldoInicial,
      ingresos,
      egresos,
      saldoFinal: saldoInicial != null ? saldoActual(saldoInicial, { ingresos, egresos }) : null,
    };

    if (action === "approve") {
      if (saldoInicial == null) {
        return NextResponse.json(
          { error: "Digita el saldo inicial antes de aprobar la conciliación." },
          { status: 400 },
        );
      }
      await approveClosing(period, accountId, vals, APROBADO_POR);
      return NextResponse.json({ ok: true, closing: await getClosing(period, accountId) });
    }

    // action === "save": guarda el saldo inicial (deja el mes sin aprobar).
    await saveClosing(period, accountId, vals);
    return NextResponse.json({ ok: true, closing: await getClosing(period, accountId) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
