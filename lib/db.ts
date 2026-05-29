// Capa de acceso a datos sobre Supabase. Solo servidor.

import { getSupabase } from "./supabase";
import type { TxnRow } from "./parseTransactions";
import type { BankMovement } from "./parseBank";
import type { Conciliado } from "./reconcile";

async function insertChunked(table: string, rows: Record<string, unknown>[]) {
  const sb = getSupabase();
  const size = 1000;
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await sb.from(table).insert(rows.slice(i, i + size) as never);
    if (error) throw new Error(`Insert ${table}: ${error.message}`);
  }
}

// ---- Transactions (base global por período) ----
export async function saveTransactions(period: string, rows: TxnRow[]) {
  const sb = getSupabase();
  await sb.from("transactions").delete().eq("period", period);
  await insertChunked(
    "transactions",
    rows.map((r) => ({
      period,
      transaction_id: r.transactionId,
      bill_id: r.billId,
      amount: r.amount,
      payment_method_type: r.paymentMethodType,
      payment_method_name: r.paymentMethodName,
      status: r.status,
      payment_date: r.paymentDate || null,
      collection_type: r.collectionType,
    })),
  );
}

export type TxnDbRow = {
  transaction_id: number;
  bill_id: string;
  amount: number;
  payment_method_type: string;
  payment_method_name: string;
  status: string;
  payment_date: string | null;
  collection_type: string;
};

export async function getTransactions(period: string): Promise<TxnDbRow[]> {
  const sb = getSupabase();
  const out: TxnDbRow[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await sb
      .from("transactions")
      .select(
        "transaction_id,bill_id,amount,payment_method_type,payment_method_name,status,payment_date,collection_type",
      )
      .eq("period", period)
      .range(from, from + size - 1);
    if (error) throw new Error(`getTransactions: ${error.message}`);
    out.push(...((data ?? []) as TxnDbRow[]));
    if (!data || data.length < size) break;
  }
  return out;
}

export async function listTransactionPeriods(): Promise<string[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from("transactions").select("period");
  if (error) throw new Error(`listPeriods: ${error.message}`);
  return [...new Set((data ?? []).map((r) => (r as { period: string }).period))].sort().reverse();
}

// ---- Movimientos del banco ----
export async function saveBankMovements(
  period: string,
  accountId: string,
  movs: BankMovement[],
) {
  const sb = getSupabase();
  await sb.from("bank_movements").delete().eq("period", period).eq("account_id", accountId);
  await insertChunked(
    "bank_movements",
    movs.map((m) => ({
      period,
      account_id: accountId,
      fecha: m.fecha || null,
      descripcion: m.descripcion,
      sucursal: m.sucursal,
      ref1: m.ref1,
      ref2: m.ref2,
      documento: m.documento,
      valor: m.valor,
      bill_id: m.billId,
    })),
  );
}

export async function getBankMovements(
  period: string,
  accountId: string,
): Promise<BankMovement[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("bank_movements")
    .select("fecha,descripcion,sucursal,ref1,ref2,documento,valor,bill_id")
    .eq("period", period)
    .eq("account_id", accountId);
  if (error) throw new Error(`getBankMovements: ${error.message}`);
  return (data ?? []).map((r) => {
    const m = r as Record<string, unknown>;
    return {
      fecha: String(m.fecha ?? ""),
      descripcion: String(m.descripcion ?? ""),
      sucursal: String(m.sucursal ?? ""),
      ref1: String(m.ref1 ?? ""),
      ref2: String(m.ref2 ?? ""),
      documento: String(m.documento ?? ""),
      valor: Number(m.valor),
      billId: String(m.bill_id ?? ""),
    };
  });
}

// ---- Cruces (para la columna "Cuenta cruce") ----
export async function saveCrossings(
  period: string,
  accountId: string,
  conciliado: Conciliado[],
) {
  const sb = getSupabase();
  await sb.from("crossings").delete().eq("period", period).eq("account_id", accountId);
  await insertChunked(
    "crossings",
    conciliado.map((c) => ({
      period,
      account_id: accountId,
      transaction_id: c.transactionId,
      bill_id_txn: c.billIdTxn,
      bill_id_banco: c.billIdBanco,
      valor_banco: c.valorBanco,
      valor_aplicado: c.valorAplicado,
      diferencia: c.diferencia,
      fecha_banco: c.fechaBanco || null,
      fecha_pago: c.fechaPago || null,
      sucursal: c.sucursal,
      tipo: c.tipo,
      nivel_match: c.nivelMatch,
    })),
  );
}

export type CrossingDbRow = {
  account_id: string;
  transaction_id: number;
  valor_banco: number;
  valor_aplicado: number;
  diferencia: number;
};

export async function getCrossings(period: string): Promise<CrossingDbRow[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("crossings")
    .select("account_id,transaction_id,valor_banco,valor_aplicado,diferencia")
    .eq("period", period);
  if (error) throw new Error(`getCrossings: ${error.message}`);
  return (data ?? []) as CrossingDbRow[];
}

export async function accountHasData(period: string, accountId: string): Promise<boolean> {
  const sb = getSupabase();
  const { count } = await sb
    .from("bank_movements")
    .select("*", { count: "exact", head: true })
    .eq("period", period)
    .eq("account_id", accountId);
  return (count ?? 0) > 0;
}
