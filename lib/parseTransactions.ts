// Lector de la base de transactions (Excel) con SheetJS.
// parseTransactionsAll -> TODAS las filas (todas las cuentas) para guardarlas.
// filterForAccount -> subconjunto que aplica a una cuenta bancaria concreta.

import * as XLSX from "xlsx";

export type TxnRow = {
  transactionId: number;
  billId: string;
  amount: number;
  paymentMethodType: string;
  paymentMethodName: string;
  status: string;
  paymentDate: string; // YYYY-MM-DD
  collectionType: string;
};

// Forma reducida que consume el motor de conciliación.
export type Transaction = {
  transactionId: number;
  billId: string;
  amount: number;
  paymentDate: string;
  collectionType: string;
};

type Row = Record<string, unknown>;

function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return v.slice(0, 10);
  return "";
}

export function parseTransactionsAll(data: Uint8Array): TxnRow[] {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null });

  const out: TxnRow[] = [];
  for (const r of rows) {
    const txnId = Number(r["Transaction ID"]);
    if (!txnId) continue;
    out.push({
      transactionId: txnId,
      billId: String(r["Bill ID"] ?? "").trim(),
      amount: Number(r["Amount"]) || 0,
      paymentMethodType: String(r["Payment Method Type"] ?? ""),
      paymentMethodName: String(r["Payment Method Name"] ?? ""),
      status: String(r["Status"] ?? ""),
      paymentDate: toDateStr(r["Payment Date"]),
      collectionType: String(r["Collection Type"] ?? ""),
    });
  }
  return out;
}

// Filtro de transactions que entran a cada cuenta bancaria.
export function filterForAccount(accountId: string, rows: TxnRow[]): Transaction[] {
  const map = (r: TxnRow): Transaction => ({
    transactionId: r.transactionId,
    billId: r.billId,
    amount: r.amount,
    paymentDate: r.paymentDate,
    collectionType: r.collectionType,
  });

  switch (accountId) {
    case "bancolombia-8465":
      // Recaudo físico Bancolombia (efectivo + cheque)
      return rows
        .filter(
          (r) =>
            r.paymentMethodName.includes("Bancolombia") &&
            r.paymentMethodType === "PHYSICAL",
        )
        .map(map);
    default:
      return [];
  }
}
