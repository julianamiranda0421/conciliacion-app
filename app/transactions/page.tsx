import { getTransactions, getCrossings, listTransactionPeriods, getLoads } from "@/lib/db";
import { accountLabel } from "@/lib/banks";
import { TransactionsUpload } from "@/components/TransactionsUpload";
import { TransactionsDashboard, type TxnView, type TxnKpis } from "@/components/TransactionsDashboard";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const periods = await listTransactionPeriods();
  const period = periodParam || periods[0] || "Mayo 2026";

  const [txns, crossings, loads] = await Promise.all([
    getTransactions(period),
    getCrossings(period),
    getLoads(period),
  ]);
  const txnCutoff = loads.find((l) => l.scope === "transactions")?.cutoff_date ?? null;

  // Mapa de cruces por transaction_id
  const crossMap = new Map<number, { cuenta: string; valorBanco: number; diferencia: number }>();
  for (const c of crossings) {
    const prev = crossMap.get(c.transaction_id);
    const cuenta = accountLabel(c.account_id);
    crossMap.set(c.transaction_id, {
      cuenta: prev ? prev.cuenta : cuenta,
      valorBanco: (prev?.valorBanco ?? 0) + Number(c.valor_banco),
      diferencia: (prev?.diferencia ?? 0) + Number(c.diferencia),
    });
  }

  const rows: TxnView[] = txns.map((t) => {
    const cross = crossMap.get(t.transaction_id);
    return {
      transactionId: t.transaction_id,
      billId: t.bill_id ?? "",
      amount: Number(t.amount),
      paymentMethod: t.payment_method_name || t.payment_method_type,
      status: t.status,
      paymentDate: t.payment_date ?? "",
      cuentaCruce: cross?.cuenta ?? "Sin cruzar",
      valorBanco: cross?.valorBanco ?? null,
      diferencia: cross?.diferencia ?? null,
    };
  });

  // KPIs
  const porCuentaMap = new Map<string, { count: number; valor: number }>();
  for (const r of rows) {
    const k = r.cuentaCruce;
    const e = porCuentaMap.get(k) ?? { count: 0, valor: 0 };
    e.count += 1;
    e.valor += r.valorBanco ?? 0;
    porCuentaMap.set(k, e);
  }
  const kpis: TxnKpis = {
    cantidadPagos: rows.length,
    totalAplicado: rows.reduce((s, r) => s + r.amount, 0),
    valorRecaudadoBanco: crossings.reduce((s, c) => s + Number(c.valor_banco), 0),
    valorCruzado: crossings.reduce((s, c) => s + Number(c.valor_aplicado), 0),
    nCruzados: rows.filter((r) => r.cuentaCruce !== "Sin cruzar").length,
    diferenciaCount: crossings.filter((c) => Number(c.diferencia) !== 0).length,
    porCuenta: [...porCuentaMap.entries()]
      .map(([cuenta, v]) => ({ cuenta, ...v }))
      .sort((a, b) => b.valor - a.valor),
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Base mensual de pagos aplicados (todas las cuentas). La columna{" "}
            <b>Cuenta cruce</b> se llena a medida que concilias cada cuenta.
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {period}
            {txnCutoff ? ` · al corte ${txnCutoff}` : ""}
          </p>
        </div>
        <TransactionsUpload period={period} periods={periods} />
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-line bg-white px-6 py-16 text-center shadow-sm">
            <div className="text-sm font-medium">No hay transactions cargadas para {period}</div>
            <p className="mt-1 text-sm text-ink-soft">
              Sube el Excel de transactions del mes con el botón “Cargar transactions”.
            </p>
          </div>
        ) : (
          <TransactionsDashboard period={period} rows={rows} kpis={kpis} />
        )}
      </div>
    </div>
  );
}
