import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import { getAccount } from "@/lib/banks";
import { filterForAccount } from "@/lib/parseTransactions";
import { reconcileForAccount } from "@/lib/reconcile";
import { getBankMovements, getReconTransactions, listReconPeriods, accountHasData, getLoads, getMovementFlags, enrichConciliado, getAdquirencias, getTcTransactions } from "@/lib/db";
import { reconcileTC } from "@/lib/reconcileTC";
import { Dashboard } from "@/components/Dashboard";
import { ConciliacionPeriodSelect } from "@/components/ConciliacionPeriodSelect";
import { AdquirenciasUpload } from "@/components/AdquirenciasUpload";
import { TarjetaCreditoPanel } from "@/components/TarjetaCreditoPanel";

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

  const periods = await listReconPeriods();
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
        <div className="flex items-center gap-3">
          <ConciliacionPeriodSelect accountId={accountId} periods={periods} current={period} />
          <Link
            href="/cargas/nueva"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-ink-soft transition hover:bg-white"
          >
            <Upload className="h-4 w-4" />
            Cargar / actualizar
          </Link>
        </div>
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

      {accountId === "davivienda-7772" && <TarjetaCreditoSection accountId={accountId} period={period} />}
    </div>
  );
}

// Sección de tarjeta de crédito (adquirencias) — solo para el 7772.
async function TarjetaCreditoSection({ accountId, period }: { accountId: string; period: string }) {
  const [adq, banco, tcRows] = await Promise.all([
    getAdquirencias(period),
    getBankMovements(period, accountId),
    getTcTransactions(period),
  ]);

  return (
    <div className="mt-10 border-t border-line pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-ink-soft">
          Archivo de adquirencias (TC) del período {period}. Se carga aparte del extracto.
        </div>
        <AdquirenciasUpload period={period} />
      </div>
      {adq.length > 0 ? (
        <TarjetaCreditoPanel result={reconcileTC(adq, banco, tcRows)} />
      ) : (
        <div className="rounded-xl border border-dashed border-line bg-white px-6 py-10 text-center text-sm text-ink-soft">
          Aún no has cargado el archivo de adquirencias para {period}. Súbelo arriba para conciliar el recaudo por tarjeta de crédito.
        </div>
      )}
    </div>
  );
}

async function AccountDashboard({ accountId, period }: { accountId: string; period: string }) {
  const [banco, txnRows, flagSigs] = await Promise.all([
    getBankMovements(period, accountId),
    getReconTransactions(period),
    getMovementFlags(period, accountId),
  ]);
  const flags = new Set(flagSigs);
  const txns = filterForAccount(accountId, txnRows);
  const result = reconcileForAccount(accountId, banco, txns, period, flags);

  // Enriquecer el detalle conciliado con datos de la factura (bills_360) y notas.
  const enriched = {
    ...result,
    conciliado: await enrichConciliado(result.conciliado, period, accountId),
  };

  return <Dashboard result={enriched} accountId={accountId} period={period} />;
}
