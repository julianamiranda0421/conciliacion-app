import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import { getAccount } from "@/lib/banks";
import { filterForAccount, type TxnRow } from "@/lib/parseTransactions";
import { reconcileForAccount } from "@/lib/reconcile";
import { getBankMovements, getTransactions, listTransactionPeriods, accountHasData, getLoads, getBills360ForTxns, getMovementFlags, getObservations } from "@/lib/db";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function ConciliacionCuentaPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { accountId } = await params;
  const { period: periodParam } = await searchParams;
  const account = getAccount(accountId);
  if (!account) notFound();

  const periods = await listTransactionPeriods();
  const period = periodParam || periods[0] || "Mayo 2026";

  const hasData = await accountHasData(period, accountId);
  const loads = await getLoads(period);
  const cutoff = loads.find((l) => l.scope === accountId)?.cutoff_date ?? null;

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/conciliaciones" className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        Volver a conciliaciones
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{account.bank} {account.accountNumber}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {account.alias} · {period}
            {cutoff ? ` · al corte ${cutoff}` : ""}
          </p>
        </div>
        <Link
          href="/cargas/nueva"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-ink-soft transition hover:bg-white"
        >
          <Upload className="h-4 w-4" />
          Cargar / actualizar
        </Link>
      </div>

      <div className="mt-6">
        {!hasData ? (
          <div className="rounded-xl border border-line bg-white px-6 py-16 text-center shadow-sm">
            <div className="text-sm font-medium">Aún no hay conciliación para {period}</div>
            <p className="mt-1 text-sm text-ink-soft">
              Ve a <b>Cargas → Nueva carga</b>, sube el extracto de esta cuenta y se conciliará
              contra la base de transactions del período.
            </p>
          </div>
        ) : (
          <AccountDashboard accountId={accountId} period={period} />
        )}
      </div>
    </div>
  );
}

async function AccountDashboard({ accountId, period }: { accountId: string; period: string }) {
  const [banco, txnDb, flagSigs] = await Promise.all([
    getBankMovements(period, accountId),
    getTransactions(period),
    getMovementFlags(period, accountId),
  ]);
  const flags = new Set(flagSigs);
  const txns = filterForAccount(
    accountId,
    txnDb.map(
      (r): TxnRow => ({
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
      }),
    ),
  );
  const result = reconcileForAccount(accountId, banco, txns, period, flags);

  // Enriquecer el detalle conciliado con datos de la factura (bills_360):
  // período de factura, valor de factura y status de factura.
  const txnIds = [...new Set(result.conciliado.map((c) => c.transactionId).filter((n) => n > 0))];
  const [minis, obs] = await Promise.all([
    getBills360ForTxns(txnIds),
    getObservations(period, accountId),
  ]);
  const byTxn = new Map<number, typeof minis>();
  for (const m of minis) {
    const arr = byTxn.get(m.transaction_id) ?? [];
    arr.push(m);
    byTxn.set(m.transaction_id, arr);
  }
  const enriched = {
    ...result,
    conciliado: result.conciliado.map((c) => {
      const cands = byTxn.get(c.transactionId) ?? [];
      const m = cands.find((x) => String(x.bill_id) === c.billIdTxn) ?? cands[0];
      return {
        ...c,
        periodoFactura: m?.period ?? "—",
        valorFactura: m?.total != null ? Number(m.total) : c.totalFactura,
        // Pagada totalmente -> SUCCESS; pago parcial -> estado real de la factura.
        statusFactura: m
          ? m.is_partial_payment
            ? m.bill_status ?? "PARCIAL"
            : "SUCCESS"
          : "SUCCESS",
        observacion: obs[String(c.transactionId)] ?? "",
      };
    }),
  };

  return <Dashboard result={enriched} accountId={accountId} period={period} />;
}
