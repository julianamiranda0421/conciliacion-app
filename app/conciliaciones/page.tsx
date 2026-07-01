import Link from "next/link";
import { Landmark, ArrowRight, Lock } from "lucide-react";
import { CONCILIABLE_ACCOUNTS, MONTHS } from "@/lib/banks";
import { CargarExtractoModal } from "@/components/CargarExtractoModal";
import { GeneralPeriodSelect } from "@/components/GeneralPeriodSelect";
import { listReconPeriods } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ConciliacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const periods = await listReconPeriods();
  // Mes mostrado por defecto: el último con datos, o el mes actual si no hay nada.
  const now = new Date();
  const currentMonthPeriod = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const selected = periodParam || periods[0] || currentMonthPeriod;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Conciliaciones</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Selecciona el mes a consultar o carga un extracto bancario.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
          <GeneralPeriodSelect current={selected} />
          <CargarExtractoModal />
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CONCILIABLE_ACCOUNTS.map((a) => {
          const href = selected
            ? `/conciliaciones/${a.id}?period=${encodeURIComponent(selected)}`
            : `/conciliaciones/${a.id}`;
          return (
            <div
              key={a.id}
              className="flex flex-col rounded-xl border border-line bg-white p-5 shadow-sm"
            >
              <div className="flex flex-1 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light text-primary">
                  <Landmark className="h-5 w-5" />
                </div>
                <div className="text-sm font-semibold">
                  {a.bank} {a.accountNumber}
                </div>
              </div>

              {a.enabled ? (
                <Link
                  href={href}
                  className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary-hover"
                >
                  Ver Conciliación
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <span className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-medium text-ink-soft">
                  <Lock className="h-4 w-4" />
                  Próximamente
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
