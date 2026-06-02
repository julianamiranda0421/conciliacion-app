import { NextResponse } from "next/server";
import { parseBankPdf } from "@/lib/parseBank";
import { parseBankDavivienda } from "@/lib/parseBankDavivienda";
import { filterForAccount, type TxnRow } from "@/lib/parseTransactions";
import { reconcileForAccount } from "@/lib/reconcile";
import { getAccount } from "@/lib/banks";
import {
  getTransactions,
  saveBankMovements,
  saveCrossings,
  recordLoad,
  type TxnDbRow,
} from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export function toTxnRow(r: TxnDbRow): TxnRow {
  return {
    transactionId: r.transaction_id,
    billId: r.bill_id ?? "",
    amount: Number(r.amount),
    paymentMethodType: r.payment_method_type ?? "",
    paymentMethodName: r.payment_method_name ?? "",
    status: r.status ?? "",
    paymentDate: r.payment_date ?? "",
    collectionType: r.collection_type ?? "",
    biaCreditsUsed: Number(r.bia_credits_used) || 0,
    s3PathDocument: r.s3_path_document ?? "",
  };
}

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

    // 1) Transactions del período (debe estar cargada previamente)
    const txnDb = await getTransactions(periodo);
    if (txnDb.length === 0) {
      return NextResponse.json(
        { error: `No hay transactions cargadas para ${periodo}. Cárgalas primero en el módulo Transactions.` },
        { status: 400 },
      );
    }
    const txns = filterForAccount(accountId, txnDb.map(toTxnRow));
    if (txns.length === 0) {
      return NextResponse.json(
        { error: "No hay transactions que apliquen a esta cuenta en el período." },
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
