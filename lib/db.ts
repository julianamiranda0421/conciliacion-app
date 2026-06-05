// Capa de acceso a datos sobre Supabase. Solo servidor.

import { getSupabase } from "./supabase";
import type { TxnRow } from "./parseTransactions";
import type { BankMovement } from "./parseBank";
import type { Conciliado } from "./reconcile";
import type { Bill360Raw } from "./metabase";

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
      bia_credits_used: r.biaCreditsUsed,
      s3_path_document: r.s3PathDocument,
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
  bia_credits_used: number | null;
  s3_path_document: string | null;
};

export async function getTransactions(period: string): Promise<TxnDbRow[]> {
  const sb = getSupabase();
  const out: TxnDbRow[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await sb
      .from("transactions")
      .select(
        "transaction_id,bill_id,amount,payment_method_type,payment_method_name,status,payment_date,collection_type,bia_credits_used,s3_path_document",
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
    conciliado.filter((c) => c.transactionId > 0).map((c) => ({
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

// ---- Registro de cargas (fecha de corte, historial) ----
export type LoadInfo = {
  cutoffDate: string | null;
  filename: string | null;
  rowCount: number | null;
};

export async function recordLoad(period: string, scope: string, info: LoadInfo) {
  try {
    const sb = getSupabase();
    await sb
      .from("loads")
      .upsert(
        {
          period,
          scope,
          cutoff_date: info.cutoffDate || null,
          filename: info.filename,
          row_count: info.rowCount,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "period,scope" },
      );
  } catch (e) {
    // Si la tabla loads aún no existe, no rompemos el flujo principal.
    console.warn("recordLoad omitido:", e instanceof Error ? e.message : e);
  }
}

export type LoadRow = {
  period: string;
  scope: string;
  cutoff_date: string | null;
  filename: string | null;
  row_count: number | null;
  updated_at: string;
};

export async function getLoads(period?: string): Promise<LoadRow[]> {
  try {
    const sb = getSupabase();
    let q = sb.from("loads").select("*").order("updated_at", { ascending: false });
    if (period) q = q.eq("period", period);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as LoadRow[];
  } catch {
    return [];
  }
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

// ---- Cartera 360 (espejo de Metabase "Payments 360") ----

// Los montos vienen como float con basura de precisión (9256369.999999998) → redondeo a 2.
function round2(v: number | null): number | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return Math.round(v * 100) / 100;
}
// Metabase a veces manda el texto "null" o cadenas vacías en columnas de texto.
function cleanText(v: string | null): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s.toLowerCase() === "null" ? null : s;
}

export async function saveBills360(rows: Bill360Raw[]): Promise<number> {
  const sb = getSupabase();
  // Refresco completo: borra todo y vuelve a insertar (bill_id siempre > 0).
  const { error: delErr } = await sb.from("bills_360").delete().gte("bill_id", 0);
  if (delErr) throw new Error(`Borrando bills_360: ${delErr.message}`);

  const mapped = rows.map((r) => ({
    bill_id: r.id,
    period: r.period,
    contract_id: r.contract_id,
    company_id: r.company_id,
    created_at: r.created_at,
    expired_date: r.expired_date,
    total: round2(r.total),
    total_with_deposit: round2(r.total_with_deposit),
    bill_status: r.bill_status,
    transaction_id: r.transaction_id,
    payment_date: r.payment_date,
    payment_method_type: cleanText(r.payment_method_type),
    payment_method_name: cleanText(r.payment_method_name),
    collection_type: cleanText(r.collection_type),
    network_collection: cleanText(r.network_collection),
    reference_bill: cleanText(r.reference_bill),
    is_partial_payment: r.is_partial_payment,
    amount: r.amount,
    bia_credits: r.bia_credits,
    transaction_state: cleanText(r.transaction_state),
    s3_path_document: cleanText(r.s3_path_document),
  }));
  await insertChunked("bills_360", mapped);
  return mapped.length;
}

export type Bills360Summary = {
  filas: number;
  conPago: number;
  sinPago: number;
  lastSync: string | null;
};

export async function getBills360Summary(): Promise<Bills360Summary> {
  const sb = getSupabase();
  const filasQ = await sb.from("bills_360").select("*", { count: "exact", head: true });
  const conPagoQ = await sb
    .from("bills_360")
    .select("*", { count: "exact", head: true })
    .not("transaction_id", "is", null);
  const lastQ = await sb
    .from("bills_360")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1);

  const filas = filasQ.count ?? 0;
  const conPago = conPagoQ.count ?? 0;
  const lastSync =
    (lastQ.data?.[0] as { synced_at?: string } | undefined)?.synced_at ?? null;
  return { filas, conPago, sinPago: Math.max(0, filas - conPago), lastSync };
}
