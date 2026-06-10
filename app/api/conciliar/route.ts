import { NextResponse } from "next/server";
import { parseBankPdf } from "@/lib/parseBank";
import { parseBankDavivienda } from "@/lib/parseBankDavivienda";
import { filterForAccount } from "@/lib/parseTransactions";
import { reconcileForAccount } from "@/lib/reconcile";
import { getAccount } from "@/lib/banks";
import {
  getReconTransactions,
  saveBankMovements,
  saveCrossings,
  recordLoad,
  enrichConciliado,
} from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const bankFile = form.get("bank");
    const periodo = String(form.get("periodo") ?? "");
    const accountId = String(form.get("accountId") ?? "");
    const cutoff = String(form.get("cutoff") ?? "");

    if (!(bankFile instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo del banco." }, { status: 400 });
    }
    if (!periodo || !accountId) {
      return NextResponse.json({ error: "Falta período o cuenta." }, { status: 400 });
    }

    // 1) Transactions del período desde bills_360 (Metabase). Ya NO se cargan a mano:
    //    se sincronizan desde Metabase en Cartera 360.
    const txnRows = await getReconTransactions(periodo);
    if (txnRows.length === 0) {
      return NextResponse.json(
        { error: `No hay pagos en bills_360 para ${periodo}. Sincroniza la cartera desde Metabase primero (Cartera 360).` },
        { status: 400 },
      );
    }
    const txns = filterForAccount(accountId, txnRows);
    if (txns.length === 0) {
      return NextResponse.json(
        { error: "No hay pagos que apliquen a esta cuenta en el período." },
        { status: 400 },
      );
    }

    // 2) Parsear el extracto del banco según el formato de la cuenta
    const account = getAccount(accountId);
    const name = bankFile.name.toLowerCase();
    const buf = new Uint8Array(await bankFile.arrayBuffer());
    let banco;
    if (account?.format === "excel") {
      if (!/\.xlsx?$/.test(name)) {
        return NextResponse.json(
          { error: "Esta cuenta espera el extracto en Excel (.xlsx)." },
          { status: 400 },
        );
      }
      banco = parseBankDavivienda(buf);
    } else {
      if (!name.endsWith(".pdf")) {
        return NextResponse.json(
          { error: "Esta cuenta espera el extracto en PDF." },
          { status: 400 },
        );
      }
      banco = await parseBankPdf(buf);
    }

    // 3) Conciliar y persistir
    const result = reconcileForAccount(accountId, banco, txns, periodo);
    await saveBankMovements(periodo, accountId, banco);
    await saveCrossings(periodo, accountId, result.conciliado);
    await recordLoad(periodo, accountId, {
      cutoffDate: cutoff,
      filename: bankFile.name,
      rowCount: banco.length,
    });

    // Enriquecer el conciliado (período/valor/status de factura) para el preview.
    result.conciliado = await enrichConciliado(result.conciliado, periodo, accountId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Error en conciliación:", err);
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { error: `No se pudo procesar la conciliación: ${msg}` },
      { status: 500 },
    );
  }
}
