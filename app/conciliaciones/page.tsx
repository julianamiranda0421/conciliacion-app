import Link from "next/link";
import { Landmark, ArrowRight, Lock } from "lucide-react";
import { CONCILIABLE_ACCOUNTS } from "@/lib/banks";

export default function ConciliacionesPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold">Conciliaciones</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Selecciona la cuenta a conciliar. El cruce usa como llave el número de
        factura y el valor, y resalta diferencias y cheques devueltos.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CONCILIABLE_ACCOUNTS.map((a) => (
          <div
            key={a.id}
            className="flex flex-col rounded-xl border border-line bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light text-primary">
                <Landmark className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">
                  {a.bank} {a.accountNumber}
                </div>
                <div className="text-xs text-ink-soft">{a.type}</div>
              </div>
            </div>
            <p className="mt-3 flex-1 text-xs text-ink-soft">{a.alias}</p>

            {a.enabled ? (
              <Link
                href={`/conciliaciones/${a.id}`}
                className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary-hover"
              >
                Conciliar
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-medium text-ink-soft">
                <Lock className="h-4 w-4" />
                Próximamente
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
