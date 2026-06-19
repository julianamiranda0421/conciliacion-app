import {
  FileText,
  Wallet,
  CheckCircle2,
  Clock,
  Sparkles,
  Percent,
  Landmark,
  Receipt,
  Scale,
} from "lucide-react";
import {
  getCartera,
  listBills360Periods,
  getCajaConciliada,
  listBankPeriods,
  getFacturasDetalle,
  type FacturaDetalleRow,
} from "@/lib/db";
import { CarteraControls } from "@/components/CarteraControls";
import { BankPeriodSelect } from "@/components/BankPeriodSelect";
import { IngresoVsAplicado } from "@/components/IngresoVsAplicado";
import { FacturasDetalle } from "@/components/FacturasDetalle";
import { accountLabel } from "@/lib/banks";

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
  searchParams: Promise<{ period?: string; bankPeriod?: string }>;
}) {
  const { period: periodParam, bankPeriod: bankParam } = await searchParams;

  const [periods, bankPeriods] = await Promise.all([
    listBills360Periods(),
    listBankPeriods(),
  ]);

  const current = periodParam ?? periods[0] ?? "todos";
  const isTodos = current === "todos" || periods.length === 0;
  const bankPeriod = bankParam ?? bankPeriods[0] ?? "";

  const [data, caja, facturas] = await Promise.all([
    getCartera(isTodos ? undefined : current),
    getCajaConciliada(bankPeriod || undefined),
    isTodos ? Promise.resolve<FacturaDetalleRow[]>([]) : getFacturasDetalle(current),
  ]);

  // % pagado = Pagado / Valor facturado (mismos valores de las tarjetas). Se usa PISO
  // (no redondeo) para no mostrar 100% cuando aún queda saldo por pagar.
  const pctPagado = data.valorFacturado
    ? Math.floor((data.pagado / data.valorFacturado) * 1000) / 10
    : 0;

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
        <CarteraControls
          periods={periods}
          current={isTodos ? "todos" : current}
          bankPeriod={bankPeriod || undefined}
          lastSync={data.lastSync}
        />
      </div>

      {/* Encabezado: totales y avance */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card icon={<FileText className="h-5 w-5 text-primary" />} label="Total de facturas" value={nf.format(data.totalFacturas)} />
        <Card icon={<Wallet className="h-5 w-5 text-primary" />} label="Valor facturado" value={cop.format(data.valorFacturado)} />
        <Card
          icon={<Percent className="h-5 w-5 text-success" />}
          label="% pagado"
          value={`${pctPagado.toFixed(1)}%`}
          accent
        />
      </div>

      {/* Detalle por estado */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card icon={<CheckCircle2 className="h-5 w-5 text-success" />} label="Facturas SUCCESS" value={nf.format(data.facturasSuccess)} />
        <Card icon={<CheckCircle2 className="h-5 w-5 text-success" />} label="Pagado" value={cop.format(data.pagado)} />
        <Card icon={<Clock className="h-5 w-5 text-amber-500" />} label="Facturas pendientes" value={nf.format(data.facturasPendientes)} />
        <Card icon={<Clock className="h-5 w-5 text-amber-500" />} label="Pendiente de pago" value={cop.format(data.valorPendiente)} />
        <Card icon={<Sparkles className="h-5 w-5 text-sky-500" />} label="Facturas con bia créditos" value={nf.format(data.facturasConCreditos)} />
        <Card icon={<Sparkles className="h-5 w-5 text-sky-500" />} label="Bia Créditos Usados" value={cop.format(data.biaCreditosUsados)} />
      </div>

      {/* Caja conciliada: ingreso al banco vs aplicado (por mes de extracto) */}
      <div className="mt-6 rounded-xl border border-line bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Caja conciliada — ingreso al banco vs aplicado</h2>
            <p className="mt-1 text-xs text-ink-soft">
              Por <b>mes de extracto bancario</b> (puede pagar facturas de meses anteriores).
              Solo cuentas ya conciliadas.
            </p>
          </div>
          <BankPeriodSelect bankPeriods={bankPeriods} current={bankPeriod} billPeriod={isTodos ? "todos" : current} />
        </div>

        {bankPeriods.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-ink-soft">
            Aún no hay extractos bancarios conciliados.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="grid grid-cols-2 gap-4 self-start">
                <Card icon={<Landmark className="h-5 w-5 text-primary" />} label="Ingreso al banco" value={cop.format(caja.ingresoBanco)} />
                <Card icon={<Receipt className="h-5 w-5 text-success" />} label="Aplicado en facturas" value={cop.format(caja.aplicado)} />
                <Card
                  icon={<Scale className={`h-5 w-5 ${caja.diferencia === 0 ? "text-success" : "text-error"}`} />}
                  label="Diferencia"
                  value={cop.format(caja.diferencia)}
                  sub={caja.nConDiferencia > 0 ? `${caja.nConDiferencia} con diferencia` : "todo cuadra"}
                  accent={caja.diferencia === 0}
                />
                <Card icon={<CheckCircle2 className="h-5 w-5 text-success" />} label="Facturas pagadas (conciliadas)" value={nf.format(caja.nFacturas)} />
              </div>
              <IngresoVsAplicado ingresoBanco={caja.ingresoBanco} aplicado={caja.aplicado} />
            </div>

            {/* Detalle por cuenta: qué cuenta bancaria cruzó cada pago (antes en Transactions). */}
            {caja.porCuenta.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Detalle por cuenta
                </h3>
                <div className="overflow-hidden rounded-lg border border-line">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          {["Cuenta", "Cruces", "Ingreso al banco", "Aplicado", "Diferencia"].map((h, i) => (
                            <th
                              key={h}
                              className={`whitespace-nowrap border-b border-line bg-surface px-3.5 py-2.5 text-[11px] uppercase tracking-wide text-ink-soft ${i === 0 ? "text-left" : "text-right"}`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {caja.porCuenta.map((c) => (
                          <tr key={c.accountId} className="hover:bg-primary-light/40">
                            <td className="whitespace-nowrap border-b border-line px-3.5 py-2.5">{accountLabel(c.accountId)}</td>
                            <td className="whitespace-nowrap border-b border-line px-3.5 py-2.5 text-right tabular-nums">{nf.format(c.nFacturas)}</td>
                            <td className="whitespace-nowrap border-b border-line px-3.5 py-2.5 text-right tabular-nums">{cop.format(c.ingresoBanco)}</td>
                            <td className="whitespace-nowrap border-b border-line px-3.5 py-2.5 text-right tabular-nums">{cop.format(c.aplicado)}</td>
                            <td className={`whitespace-nowrap border-b border-line px-3.5 py-2.5 text-right tabular-nums ${c.diferencia !== 0 ? "font-bold text-error" : ""}`}>
                              {cop.format(c.diferencia)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

          </>
        )}
      </div>

      {/* Detalle de TODAS las facturas del período (pagadas o no) + contra qué cuenta cruzaron. */}
      {isTodos ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white px-6 py-8 text-center text-sm text-ink-soft">
          Selecciona un período arriba para ver el detalle de facturas.
        </div>
      ) : (
        <FacturasDetalle rows={facturas} />
      )}
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
