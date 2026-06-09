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

// ---- Clasificación manual de movimientos (marcar ingreso como recaudo) ----
// Defensivas: si la tabla movement_flags no existe, no rompen el flujo.
export async function getMovementFlags(period: string, accountId: string): Promise<string[]> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("movement_flags")
      .select("sig")
      .eq("period", period)
      .eq("account_id", accountId);
    if (error) throw error;
    return (data ?? []).map((r) => (r as { sig: string }).sig);
  } catch (e) {
    console.warn("getMovementFlags omitido:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function addMovementFlag(period: string, accountId: string, sig: string) {
  const sb = getSupabase();
  const { error } = await sb
    .from("movement_flags")
    .upsert(
      { period, account_id: accountId, sig, es_recaudo: true, updated_at: new Date().toISOString() } as never,
      { onConflict: "period,account_id,sig" },
    );
  if (error) throw new Error(`addMovementFlag: ${error.message}`);
}

export async function removeMovementFlag(period: string, accountId: string, sig: string) {
  const sb = getSupabase();
  const { error } = await sb
    .from("movement_flags")
    .delete()
    .eq("period", period)
    .eq("account_id", accountId)
    .eq("sig", sig);
  if (error) throw new Error(`removeMovementFlag: ${error.message}`);
}

// ---- Observaciones por partida conciliada (clave por transaction_id) ----
export async function getObservations(
  period: string,
  accountId: string,
): Promise<Record<string, string>> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("observations")
      .select("transaction_id,texto")
      .eq("period", period)
      .eq("account_id", accountId);
    if (error) throw error;
    const out: Record<string, string> = {};
    for (const r of data ?? []) {
      const row = r as { transaction_id: number; texto: string | null };
      out[String(row.transaction_id)] = row.texto ?? "";
    }
    return out;
  } catch (e) {
    console.warn("getObservations omitido:", e instanceof Error ? e.message : e);
    return {};
  }
}

export async function saveObservation(
  period: string,
  accountId: string,
  transactionId: number,
  texto: string,
) {
  const sb = getSupabase();
  const { error } = await sb
    .from("observations")
    .upsert(
      { period, account_id: accountId, transaction_id: transactionId, texto, updated_at: new Date().toISOString() } as never,
      { onConflict: "period,account_id,transaction_id" },
    );
  if (error) throw new Error(`saveObservation: ${error.message}`);
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

// ---- Cartera 360: vista gerencial (agregados por factura) ----

// 'M-YYYY' -> número ordenable (mayor = más reciente). Ej: '5-2026' -> 202605.
function periodKey(p: string): number {
  const [m, y] = p.split("-").map((x) => Number(x));
  return (y || 0) * 100 + (m || 0);
}

// Lista de períodos presentes en bills_360, del más reciente al más antiguo.
export async function listBills360Periods(): Promise<string[]> {
  const sb = getSupabase();
  const set = new Set<string>();
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await sb
      .from("bills_360")
      .select("period")
      .range(from, from + size - 1);
    if (error) throw new Error(`listBills360Periods: ${error.message}`);
    for (const r of data ?? []) {
      const p = (r as { period: string | null }).period;
      if (p) set.add(p);
    }
    if (!data || data.length < size) break;
  }
  return [...set].sort((a, b) => periodKey(b) - periodKey(a));
}

type CarteraRow = {
  bill_id: number;
  bill_status: string | null;
  total: number | null;
  transaction_id: number | null;
  transaction_state: string | null;
  payment_date: string | null;
  is_partial_payment: boolean | null;
  amount: number | null;
  bia_credits: number | null;
};

async function fetchCarteraRows(period?: string): Promise<CarteraRow[]> {
  const sb = getSupabase();
  const cols =
    "bill_id,bill_status,total,transaction_id,transaction_state,payment_date,is_partial_payment,amount,bia_credits";
  const out: CarteraRow[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    let q = sb.from("bills_360").select(cols).range(from, from + size - 1);
    if (period) q = q.eq("period", period);
    const { data, error } = await q;
    if (error) throw new Error(`getCartera: ${error.message}`);
    out.push(...((data ?? []) as CarteraRow[]));
    if (!data || data.length < size) break;
  }
  return out;
}

export type CarteraData = {
  totalFacturas: number;
  valorTotal: number;
  facturasSuccess: number;
  valorPagadas: number;
  pctPagadoFacturas: number;
  pctPagadoValor: number;
  facturasPendientes: number;
  valorPendientes: number;
  facturasParcial: number;
  valorParcial: number;
  facturasConCreditos: number;
  valorCreditos: number;
  lastSync: string | null;
};

// Agregados gerenciales sobre bills_360. period = undefined => todos.
// OJO: el grano es factura×pago. Para evitar sobreconteo:
//  - los VALORES de factura se toman de bills.total (una vez por factura);
//  - el RECAUDO y los BIA CRÉDITOS se deduplican por transaction_id, porque una
//    misma transacción (amount/bia_credits) se repite en cada factura que paga.
export async function getCartera(period?: string): Promise<CarteraData> {
  const rows = await fetchCarteraRows(period);

  type Bill = { status: string | null; total: number; paid: boolean; partial: boolean; credits: boolean };
  const bills = new Map<number, Bill>();
  const txns = new Map<number, { credits: number }>();

  for (const r of rows) {
    let b = bills.get(r.bill_id);
    if (!b) {
      b = { status: r.bill_status, total: Number(r.total) || 0, paid: false, partial: false, credits: false };
      bills.set(r.bill_id, b);
    }
    const success = r.transaction_state === "SUCCESS";
    if (r.transaction_id != null && success) b.paid = true;
    if (r.is_partial_payment === true) b.partial = true;
    if (success && (Number(r.bia_credits) || 0) > 0) b.credits = true;
    if (r.transaction_id != null && success && !txns.has(r.transaction_id)) {
      txns.set(r.transaction_id, { credits: Number(r.bia_credits) || 0 });
    }
  }

  const billArr = [...bills.values()];
  const sum = (arr: Bill[]) => arr.reduce((s, b) => s + b.total, 0);
  const success = billArr.filter((b) => b.status === "SUCCESS");
  const pendientes = billArr.filter((b) => b.status === "CREATED");
  const parcial = billArr.filter((b) => b.partial);
  const conCreditos = billArr.filter((b) => b.credits);

  const totalFacturas = billArr.length;
  const valorTotal = sum(billArr);
  const valorPagadas = sum(success);
  const valorCreditos = [...txns.values()].reduce((s, t) => s + t.credits, 0);

  const sb = getSupabase();
  const lastQ = await sb
    .from("bills_360")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1);
  const lastSync = (lastQ.data?.[0] as { synced_at?: string } | undefined)?.synced_at ?? null;

  return {
    totalFacturas,
    valorTotal,
    facturasSuccess: success.length,
    valorPagadas,
    pctPagadoFacturas: totalFacturas ? (success.length / totalFacturas) * 100 : 0,
    pctPagadoValor: valorTotal ? (valorPagadas / valorTotal) * 100 : 0,
    facturasPendientes: pendientes.length,
    valorPendientes: sum(pendientes),
    facturasParcial: parcial.length,
    valorParcial: sum(parcial),
    facturasConCreditos: conCreditos.length,
    valorCreditos,
    lastSync,
  };
}

// ---- Caja conciliada: ingreso al banco vs aplicado (por mes de EXTRACTO bancario) ----
// Fuente = crossings (cruce banco↔pago ya conciliado). El período aquí es el mes del
// extracto bancario (texto, ej. "Mayo 2026"), distinto del período de la factura.

export async function listBankPeriods(): Promise<string[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from("crossings").select("period");
  if (error) throw new Error(`listBankPeriods: ${error.message}`);
  return [...new Set((data ?? []).map((r) => (r as { period: string }).period))];
}

// Datos de factura (bills_360) para enriquecer el detalle de conciliación,
// buscados por transaction_id. Una transacción puede pagar varias facturas;
// se devuelven todas y la página elige la que cuadra por bill_id.
export type Bill360Mini = {
  transaction_id: number;
  bill_id: number;
  period: string | null;
  total: number | null;
  bill_status: string | null;
  is_partial_payment: boolean | null;
};

// Enriquece las partidas conciliadas con datos de la factura (bills_360) y la
// observación manual. Se usa en la página de conciliación y en /api/conciliar
// (para que el preview del wizard también muestre período/valor/status).
export async function enrichConciliado(
  conciliado: Conciliado[],
  period: string,
  accountId: string,
): Promise<Conciliado[]> {
  const txnIds = [...new Set(conciliado.map((c) => c.transactionId).filter((n) => n > 0))];
  const [minis, obs] = await Promise.all([
    getBills360ForTxns(txnIds),
    getObservations(period, accountId),
  ]);
  const byTxn = new Map<number, Bill360Mini[]>();
  for (const m of minis) {
    const arr = byTxn.get(m.transaction_id) ?? [];
    arr.push(m);
    byTxn.set(m.transaction_id, arr);
  }
  return conciliado.map((c) => {
    const cands = byTxn.get(c.transactionId) ?? [];
    const m = cands.find((x) => String(x.bill_id) === c.billIdTxn) ?? cands[0];
    return {
      ...c,
      periodoFactura: m?.period ?? "—",
      valorFactura: m?.total != null ? Number(m.total) : c.totalFactura,
      statusFactura: m ? (m.is_partial_payment ? m.bill_status ?? "PARCIAL" : "SUCCESS") : "SUCCESS",
      observacion: obs[String(c.transactionId)] ?? "",
    };
  });
}

export async function getBills360ForTxns(txnIds: number[]): Promise<Bill360Mini[]> {
  if (txnIds.length === 0) return [];
  const sb = getSupabase();
  const out: Bill360Mini[] = [];
  const size = 300;
  for (let i = 0; i < txnIds.length; i += size) {
    const chunk = txnIds.slice(i, i + size);
    const { data, error } = await sb
      .from("bills_360")
      .select("transaction_id,bill_id,period,total,bill_status,is_partial_payment")
      .in("transaction_id", chunk);
    if (error) throw new Error(`getBills360ForTxns: ${error.message}`);
    out.push(...((data ?? []) as Bill360Mini[]));
  }
  return out;
}

export type CajaConciliada = {
  ingresoBanco: number;
  aplicado: number;
  diferencia: number;
  nFacturas: number;
  nConDiferencia: number;
};

export async function getCajaConciliada(bankPeriod?: string): Promise<CajaConciliada> {
  const sb = getSupabase();
  let q = sb.from("crossings").select("valor_banco,valor_aplicado,diferencia");
  if (bankPeriod) q = q.eq("period", bankPeriod);
  const { data, error } = await q;
  if (error) throw new Error(`getCajaConciliada: ${error.message}`);
  const rows = (data ?? []) as { valor_banco: number; valor_aplicado: number; diferencia: number }[];
  const ingresoBanco = rows.reduce((s, r) => s + (Number(r.valor_banco) || 0), 0);
  const aplicado = rows.reduce((s, r) => s + (Number(r.valor_aplicado) || 0), 0);
  const diferencia = rows.reduce((s, r) => s + (Number(r.diferencia) || 0), 0);
  return {
    ingresoBanco,
    aplicado,
    diferencia,
    nFacturas: rows.length,
    nConDiferencia: rows.filter((r) => Number(r.diferencia) !== 0).length,
  };
}
