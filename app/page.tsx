import {
  TrendingUp, TrendingDown, Percent,
  Receipt, FileText, Clock, CheckCircle2,
} from "lucide-react";
import {
  listBankPeriods,
  getBankTotalsByPeriod,
  getBankTotalsByAccount,
  getBankTotalsByWeek,
  getCartera,
  getCajaConciliada,
} from "@/lib/db";
import { MONTHS, accountLabel } from "@/lib/banks";
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

  const [byPeriod, byAccount, weekly, cartera, caja] = await Promise.all([
    getBankTotalsByPeriod(),
    getBankTotalsByAccount(selected),
    getBankTotalsByWeek(selected),
    getCartera(selected),
    getCajaConciliada(selected),
  ]);

  const totalIngresos = byAccount.reduce((s, a) => s + a.ingresos, 0);
  const totalEgresos = byAccount.reduce((s, a) => s + a.egresos, 0);
  const recaudoConc = caja.ingresoBanco; // recaudo conciliado (crossings)
  const pctRecaudo = totalIngresos > 0 ? Math.min(100, Math.round((recaudoConc / totalIngresos) * 100)) : 0;
  const pctPagado = cartera.valorFacturado
    ? Math.floor((cartera.pagado / cartera.valorFacturado) * 1000) / 10
    : 0;

  const monthly: SeriesPoint[] = byPeriod.slice(-12).map((d) => ({
    label: shortPeriod(d.period),
    ingresos: d.ingresos,
    egresos: d.egresos,
    highlight: d.period === selected,
  }));
  const weeklySeries: SeriesPoint[] = weekly.map((w) => ({ label: w.label, ingresos: w.ingresos, egresos: w.egresos }));
  const maxAcc = Math.max(1, ...byAccount.map((a) => a.ingresos));

  return (
    <div className="mx-auto max-w-7xl">
      {/* Encabezado + selector de período */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Bienvenido, <span className="text-primary">Finanzas</span> 👋
          </h1>
          <p className="mt-1 text-sm text-ink-soft">Resumen gerencial del período {selected}.</p>
        </div>
        <DashboardPeriodSelect current={selected} />
      </div>

      {/* KPIs hero */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi tone="primary" icon={<TrendingUp className="h-4 w-4" />} label="Total ingresos" big={moneyShort(totalIngresos)} sub={money(totalIngresos)} />
        <Kpi tone="error" icon={<TrendingDown className="h-4 w-4" />} label="Total egresos" big={moneyShort(totalEgresos)} sub={money(totalEgresos)} />
        <Kpi tone="ok" icon={<Percent className="h-4 w-4" />} label="% Recaudo / Ingreso" big={`${pctRecaudo}%`} sub={`${moneyShort(recaudoConc)} conciliado`} bar={pctRecaudo} />
        <Kpi tone="ok" icon={<Percent className="h-4 w-4" />} label="% Pagado (Cartera)" big={`${pctPagado.toFixed(1)}%`} sub={`${moneyShort(cartera.pagado)} de ${moneyShort(cartera.valorFacturado)}`} bar={pctPagado} />
      </div>

      {/* Gráfico Ingresos vs Egresos */}
      <div className="mt-6">
        <IngresosEgresosChart monthly={monthly} weekly={weeklySeries} />
      </div>

      {/* Cartera + Ingresos por cuenta */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold">Cartera 360 — {selected}</h2>
          <p className="mt-0.5 text-xs text-ink-soft">Estado de facturas del período.</p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Mini icon={<FileText className="h-4 w-4 text-primary" />} label="Total facturado" value={money(cartera.valorFacturado)} />
            <Mini icon={<CheckCircle2 className="h-4 w-4 text-success" />} label="Valor pagado" value={money(cartera.pagado)} />
            <Mini icon={<Clock className="h-4 w-4 text-warning" />} label="Pendiente de pago" value={money(cartera.valorPendiente)} />
            <Mini icon={<Receipt className="h-4 w-4 text-primary" />} label="Recaudo conciliado" value={money(recaudoConc)} />
          </div>
        </div>

        <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold">Ingresos por cuenta — {selected}</h2>
          <p className="mt-0.5 text-xs text-ink-soft">Cuánto aportó cada cuenta al ingreso del mes.</p>
          {byAccount.length === 0 ? (
            <div className="mt-6 flex h-40 items-center justify-center text-sm text-ink-soft">
              Sin datos del período. Carga los extractos en Conciliaciones.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {byAccount.map((a) => (
                <div key={a.accountId} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-sm" title={accountLabel(a.accountId)}>
                    {accountLabel(a.accountId)}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded bg-line">
                    <div className="h-full rounded bg-success" style={{ width: `${(a.ingresos / maxAcc) * 100}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums">{moneyShort(a.ingresos)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  primary: "text-primary",
  ok: "text-success",
  error: "text-error",
  warn: "text-warning",
};

function Kpi({
  tone,
  icon,
  label,
  big,
  sub,
  bar,
}: {
  tone: keyof typeof TONE | string;
  icon: React.ReactNode;
  label: string;
  big: string;
  sub?: string;
  bar?: number;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-ink-soft">
        <span className={TONE[tone] ?? "text-ink-soft"}>{icon}</span>
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${TONE[tone] ?? "text-ink"}`}>{big}</div>
      {sub && <div className="mt-1 truncate text-xs text-ink-soft">{sub}</div>}
      {bar != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-line">
          <div className="h-full bg-success" style={{ width: `${Math.min(100, bar)}%` }} />
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
