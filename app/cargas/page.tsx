import Link from "next/link";
import { Plus, Inbox } from "lucide-react";
import { getLoads } from "@/lib/db";
import { accountLabel } from "@/lib/banks";

export const dynamic = "force-dynamic";

export default async function CargasPage() {
  const loads = await getLoads();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cargas</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Última carga por cuenta y período (con su fecha de corte). Cada nueva
            carga reemplaza a la anterior del mismo período.
          </p>
        </div>
        <Link
          href="/cargas/nueva"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" />
          Nueva carga
        </Link>
      </div>

      {loads.length === 0 ? (
        <div className="mt-6 rounded-xl border border-line bg-white shadow-sm">
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-ink-soft">
              <Inbox className="h-6 w-6" />
            </div>
            <div className="text-sm font-medium">Aún no hay cargas registradas</div>
            <p className="max-w-sm text-sm text-ink-soft">
              Crea tu primera carga para subir el extracto del banco y conciliarlo.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Período", "Origen", "Fecha de corte", "Archivo", "Filas", "Actualizado"].map((h) => (
                  <th key={h} className="border-b border-line bg-surface px-4 py-2.5 text-left text-[11px] uppercase tracking-wide text-ink-soft">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loads.map((l) => (
                <tr key={`${l.period}-${l.scope}`} className="hover:bg-primary-light/40">
                  <td className="border-b border-line px-4 py-2.5 text-sm">{l.period}</td>
                  <td className="border-b border-line px-4 py-2.5 text-sm">
                    {l.scope === "transactions" ? (
                      <span className="rounded-md bg-primary-light px-2 py-1 text-xs font-medium text-primary">Transactions</span>
                    ) : l.scope === "adquirencias-7772" ? (
                      <span className="rounded-md bg-primary-light px-2 py-1 text-xs font-medium text-primary">Adquirencias (TC)</span>
                    ) : (
                      accountLabel(l.scope)
                    )}
                  </td>
                  <td className="border-b border-line px-4 py-2.5 text-sm">{l.cutoff_date ?? "—"}</td>
                  <td className="max-w-[220px] truncate border-b border-line px-4 py-2.5 text-sm text-ink-soft">{l.filename ?? "—"}</td>
                  <td className="border-b border-line px-4 py-2.5 text-right text-sm tabular-nums">{l.row_count ?? "—"}</td>
                  <td className="border-b border-line px-4 py-2.5 text-sm text-ink-soft">{l.updated_at?.slice(0, 16).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
