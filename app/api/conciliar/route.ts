import { NextResponse } from "next/server";
import { parseBankPdf } from "@/lib/parseBank";
import { filterForAccount, type TxnRow } from "@/lib/parseTransactions";
import { reconcile } from "@/lib/reconcile";
import {
  getTransactions,
  saveBankMovements,
  saveCrossings,
  recordLoad,
  type TxnDbRow,
} from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

function toTxnRow(r: TxnDbRow): TxnRow {
  return {
    transactionId: r.transaction_id,
    billId: r.bill_id ?? "",
    amount: Number(r.amount),
    paymentMethodType: r.payment_method_type ?? "",
    paymentMethodName: r.payment_method_name ?? "",
    status: r.status ?? "",
    paymentDate: r.payment_date ?? "",
    collectionType: r.collection_type ?? "",
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

    // 2) Parsear el extracto del banco (PDF; Excel pendiente de muestra)
    const name = bankFile.name.toLowerCase();
    const buf = new Uint8Array(await bankFile.arrayBuffer());
    if (!name.endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Por ahora esta cuenta procesa el extracto en PDF. El soporte de Excel se habilitará pronto." },
        { status: 400 },
      );
    }
    const banco = await parseBankPdf(buf);

    // 3) Conciliar y persistir
    const result = reconcile(banco, txns, periodo);
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
