import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import { getAccount } from "@/lib/banks";
import { filterForAccount, type TxnRow } from "@/lib/parseTransactions";
import { reconcileForAccount } from "@/lib/reconcile";
import { getBankMovements, getTransactions, listTransactionPeriods, accountHasData, getLoads } from "@/lib/db";
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
  const [banco, txnDb] = await Promise.all([
    getBankMovements(period, accountId),
    getTransactions(period),
  ]);
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
  const result = reconcileForAccount(accountId, banco, txns, period);
  return <Dashboard result={result} />;
}
