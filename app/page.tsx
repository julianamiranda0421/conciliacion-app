import Link from "next/link";
import {
  TrendingUp, TrendingDown, Percent,
  Receipt, FileText, Clock, CheckCircle2, Landmark, Eye,
} from "lucide-react";
import {
  listBankPeriods,
  getBankTotalsByPeriod,
  getClosingsByPeriod,
  getBankTotalsByWeek,
  getCartera,
  getCajaConciliada,
} from "@/lib/db";
import { MONTHS, accountLabel, CONCILIABLE_ACCOUNTS } from "@/lib/banks";
import { money, moneyShort } from "@/lib/format";
import { DashboardPeriodSelect } from "@/components/DashboardPeriodSelect";
import { IngresosEgresosChart, type SeriesPoint } from "@/components/IngresosEgresosChart";

export const dynamic = "force-dynamic";

const MES_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
// "Mayo 2026" -> "May 26".
function shortPeriod(p: string): string {
  const parts = p.trim().split(/\s+/);
  const idx = MONTHS.findIndex((m) => m.toLowerCase() === parts[0]?.toLowerCase());
  const yy = parts[1] ? parts[1].slice(2) : "";
  return idx >= 0 ? `${MES_ABBR[idx]} ${yy}` : p;
}

// El período bancario es "Mayo 2026"; bills_360 usa "M-YYYY" (ej. "5-2026").
// Se convierte para consultar Cartera del mismo mes.
function toBillPeriod(p: string): string | undefined {
  const parts = p.trim().split(/\s+/);
  const idx = MONTHS.findIndex((m) => m.toLowerCase() === parts[0]?.toLowerCase());
  const year = parts[1];
  return idx >= 0 && year ? `${idx + 1}-${year}` : undefined;
}

// Días del mes del período. 31 por defecto si no parsea.
function daysInPeriod(period: string): { days: number; idx: number } {
  const parts = period.trim().split(/\s+/);
  const idx = MONTHS.findIndex((m) => m.toLowerCase() === parts[0]?.toLowerCase());
  const year = Number(parts[1]);
  const days = idx >= 0 && year ? new Date(year, idx + 1, 0).getDate() : 31;
  return { days, idx };
}

// Rango largo por semana (tooltip): ["1–7 de mayo", "8–14 de mayo", ...].
function weekRanges(period: string, weekCount: number): string[] {
  const { days, idx } = daysInPeriod(period);
  const mesLower = idx >= 0 ? MONTHS[idx].toLowerCase() : "";
  return Array.from({ length: weekCount }, (_, i) => {
    const start = i * 7 + 1;
    const end = Math.min((i + 1) * 7, days);
    return `${start}–${end} de ${mesLower}`;
  });
}

// Rango corto por semana (eje X): ["1-7 May", "8-14 May", ...].
function weekRangesShort(period: string, weekCount: number): string[] {
  const { days, idx } = daysInPeriod(period);
  const abbr = idx >= 0 ? MES_ABBR[idx] : "";
  return Array.from({ length: weekCount }, (_, i) => {
    const start = i * 7 + 1;
    const end = Math.min((i + 1) * 7, days);
    return `${start}-${end} ${abbr}`;
  });
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const bankPeriods = await listBankPeriods();
  const now = new Date();
  const currentMonthPeriod = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const selected = periodParam || bankPeriods[0] || currentMonthPeriod;

  const [byPeriod, closings, weekly, cartera, caja] = await Promise.all([
    getBankTotalsByPeriod(),
    getClosingsByPeriod(selected),
    getBankTotalsByWeek(selected),
    getCartera(toBillPeriod(selected)),
    getCajaConciliada(selected),
  ]);

  const closingMap = new Map(closings.map((c) => [c.account_id, c]));
  const totalIngresos = closings.reduce((s, c) => s + (c.ingresos ?? 0), 0);
  const totalEgresos = closings.reduce((s, c) => s + (c.egresos ?? 0), 0);
  const recaudoConc = caja.ingresoBanco; // recaudo conciliado (crossings)
  const pctRecaudo = totalIngresos > 0 ? Math.min(100, Math.round((recaudoConc / totalIngresos) * 100)) : 0;
  const pctPagado = cartera.valorFacturado
    ? Math.floor((cartera.pagado / cartera.valorFacturado) * 1000) / 10
    : 0;

  const monthly: SeriesPoint[] = byPeriod.slice(-12).map((d) => ({
    label: shortPeriod(d.period),
    sub: d.period,
    ingresos: d.ingresos,
    egresos: d.egresos,
    highlight: d.period === selected,
  }));
  const ranges = weekRanges(selected, weekly.length);
  const rangesShort = weekRangesShort(selected, weekly.length);
  const weeklySeries: SeriesPoint[] = weekly.map((w, i) => ({
    label: rangesShort[i] ?? w.label,
    sub: ranges[i],
    ingresos: w.ingresos,
    egresos: w.egresos,
  }));

  return (
    <div className="mx-auto max-w-7xl">
      {/* Encabezado + selector de período */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold text-ink">Bienvenidos a la Torre de Control de Finanzas 👋</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Aquí encuentras el detalle de <b className="font-medium text-ink">ingresos vs egresos</b> de las cuentas
            bancarias de la compañía, y el detalle de <b className="font-medium text-ink">Cartera</b> — la facturación
            de la compañía con su respectivo recaudo.
          </p>
        </div>
        <DashboardPeriodSelect current={selected} />
      </div>

      {/* Fila superior: KPIs (izquierda, 2×2) + Gráfico Ingresos vs Egresos (derecha) */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="grid min-w-0 grid-cols-2 grid-rows-2 gap-4">
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Total ingresos" big={money(totalIngresos)} />
          <Kpi icon={<TrendingDown className="h-4 w-4" />} label="Total egresos" big={money(totalEgresos)} />
          <Kpi icon={<Percent className="h-4 w-4" />} label="% Recaudo / Ingreso" big={`${pctRecaudo}%`} sub={`${moneyShort(recaudoConc)} conciliado`} bar={pctRecaudo} />
          <Kpi icon={<Percent className="h-4 w-4" />} label="% Pagado (Cartera)" big={`${pctPagado.toFixed(1)}%`} sub="de lo facturado" bar={pctPagado} />
        </div>
        <div className="min-w-0">
          <IngresosEgresosChart monthly={monthly} weekly={weeklySeries} />
        </div>
      </div>

      {/* Detalle por cuentas bancarias */}
      <h2 className="mt-8 text-lg font-bold">Detalle por Cuentas Bancarias</h2>
      <div className="mt-3 rounded-xl border border-line bg-white p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {[
                  ["Cuenta bancaria", "text-left"],
                  ["Saldo inicial", "text-right"],
                  ["Ingresos", "text-right"],
                  ["Egresos", "text-right"],
                  ["Saldo actual", "text-right"],
                  ["Conciliación", "text-center"],
                ].map(([h, align]) => (
                  <th key={h} className={`whitespace-nowrap border-b border-line bg-surface px-3.5 py-2.5 text-[11px] uppercase tracking-wide text-ink-soft ${align}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CONCILIABLE_ACCOUNTS.filter((a) => a.enabled).map((a) => {
                const c = closingMap.get(a.id);
                const ingresos = c?.ingresos ?? 0;
                const egresos = c?.egresos ?? 0;
                const saldoIni = c?.saldo_inicial ?? null;
                const saldoAct = (saldoIni ?? 0) + ingresos - egresos;
                const estado = c?.aprobado ? "aprobada" : c ? "parcial" : "sin";
                return (
                  <tr key={a.id} className="hover:bg-primary-light/30">
                    <td className="whitespace-nowrap border-b border-line px-3.5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-light text-primary">
                          <Landmark className="h-4 w-4" />
                        </span>
                        <span className="font-medium">{accountLabel(a.id)}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap border-b border-line px-3.5 py-3 text-right tabular-nums text-ink-soft">
                      {saldoIni != null ? money(saldoIni) : "—"}
                    </td>
                    <td className="whitespace-nowrap border-b border-line px-3.5 py-3 text-right tabular-nums">{money(ingresos)}</td>
                    <td className="whitespace-nowrap border-b border-line px-3.5 py-3 text-right tabular-nums">{money(egresos)}</td>
                    <td className="whitespace-nowrap border-b border-line px-3.5 py-3 text-right font-semibold tabular-nums">{money(saldoAct)}</td>
                    <td className="whitespace-nowrap border-b border-line px-3.5 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <EstadoBadge estado={estado} />
                        <Link
                          href={`/conciliaciones/${a.id}?period=${encodeURIComponent(selected)}`}
                          title="Ver conciliación"
                          className="rounded-md p-1.5 text-ink-soft transition hover:bg-surface hover:text-primary"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalle recaudo (cartera) */}
      <h2 className="mt-8 text-lg font-bold">Detalle Recaudo — {selected}</h2>
      <div className="mt-3 rounded-xl border border-line bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Mini icon={<FileText className="h-4 w-4 text-primary" />} label="Total facturado" value={money(cartera.valorFacturado)} />
          <Mini icon={<CheckCircle2 className="h-4 w-4 text-success" />} label="Valor pagado" value={money(cartera.pagado)} />
          <Mini icon={<Clock className="h-4 w-4 text-warning" />} label="Pendiente de pago" value={money(cartera.valorPendiente)} />
          <Mini icon={<Receipt className="h-4 w-4 text-primary" />} label="Recaudo conciliado" value={money(recaudoConc)} />
        </div>
      </div>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === "aprobada") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Aprobada
      </span>
    );
  }
  if (estado === "parcial") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2.5 py-1 text-xs font-semibold text-warning">
        Parcial
      </span>
    );
  }
  return <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft">Sin datos</span>;
}

function Kpi({
  icon,
  label,
  big,
  sub,
  bar,
}: {
  icon: React.ReactNode;
  label: string;
  big: string;
  sub?: string;
  bar?: number;
}) {
  return (
    <div className="flex h-full flex-col justify-center rounded-xl border border-line bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-ink-soft">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-xl font-bold tabular-nums text-ink">{big}</div>
      {sub && <div className="mt-1 truncate text-xs text-ink-soft">{sub}</div>}
      {bar != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-line">
          <div className="h-full bg-primary" style={{ width: `${Math.min(100, bar)}%` }} />
        </div>
      )}
    </div>
  );
}

function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface/50 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-soft">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
