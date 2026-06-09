import {
  FileText,
  Wallet,
  CheckCircle2,
  Clock,
  PieChart,
  Sparkles,
  Percent,
} from "lucide-react";
import { getCartera, listBills360Periods } from "@/lib/db";
import { CarteraControls } from "@/components/CarteraControls";
import { RecaudoCurve } from "@/components/RecaudoCurve";

export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("es-CO");
const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export default async function CarteraPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const periods = await listBills360Periods();
  const current = periodParam ?? periods[0] ?? "todos";
  const isTodos = current === "todos" || periods.length === 0;
  const data = await getCartera(isTodos ? undefined : current);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cartera 360</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Estado de las facturas desde 2026, sincronizado desde Metabase. Vista gerencial
            {isTodos ? " (todos los períodos)" : ` del período ${current}`}.
          </p>
        </div>
        <CarteraControls periods={periods} current={isTodos ? "todos" : current} lastSync={data.lastSync} />
      </div>

      {/* Encabezado: totales y avance */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card icon={<FileText className="h-5 w-5 text-primary" />} label="Total facturas" value={nf.format(data.totalFacturas)} />
        <Card icon={<Wallet className="h-5 w-5 text-primary" />} label="Valor total cartera" value={cop.format(data.valorTotal)} />
        <Card
          icon={<Percent className="h-5 w-5 text-success" />}
          label="% pagado"
          value={`${data.pctPagadoFacturas.toFixed(1)}%`}
          sub={`${data.pctPagadoValor.toFixed(1)}% del valor`}
          accent
        />
      </div>

      {/* Detalle por estado */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card icon={<CheckCircle2 className="h-5 w-5 text-success" />} label="Facturas SUCCESS" value={nf.format(data.facturasSuccess)} />
        <Card icon={<CheckCircle2 className="h-5 w-5 text-success" />} label="Valor pagadas" value={cop.format(data.valorPagadas)} />
        <Card icon={<Clock className="h-5 w-5 text-amber-500" />} label="Facturas pendientes" value={nf.format(data.facturasPendientes)} />
        <Card icon={<Clock className="h-5 w-5 text-amber-500" />} label="Valor pendientes" value={cop.format(data.valorPendientes)} />
        <Card icon={<PieChart className="h-5 w-5 text-primary" />} label="Facturas pago parcial" value={nf.format(data.facturasParcial)} sub="cruza otros estados" />
        <Card icon={<PieChart className="h-5 w-5 text-primary" />} label="Valor pago parcial" value={cop.format(data.valorParcial)} />
        <Card icon={<Sparkles className="h-5 w-5 text-sky-500" />} label="Facturas con bia créditos" value={nf.format(data.facturasConCreditos)} />
        <Card icon={<Sparkles className="h-5 w-5 text-sky-500" />} label="Valor bia créditos usados" value={cop.format(data.valorCreditos)} />
      </div>

      {/* Curva de recaudo */}
      <div className="mt-6 rounded-xl border border-line bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Curva de recaudo</h2>
        <p className="mb-3 text-xs text-ink-soft">
          % del recaudo acumulado en el tiempo {isTodos ? "(todos los períodos)" : `(período ${current})`}.
        </p>
        <RecaudoCurve points={data.curva} />
      </div>
    </div>
  );
}

function Card({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${accent ? "border-success/40" : "border-line"}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-ink-soft">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-soft">{sub}</div>}
    </div>
  );
}
