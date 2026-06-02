"use client";

import { useMemo, useState } from "react";

export type TxnView = {
  transactionId: number;
  billId: string;
  amount: number;
  biaCreditos: number;
  totalFactura: number;
  paymentMethod: string;
  status: string;
  paymentDate: string;
  cuentaCruce: string;
  valorBanco: number | null;
  diferencia: number | null;
};

export type TxnKpis = {
  cantidadPagos: number;
  totalAplicado: number;
  valorRecaudadoBanco: number;
  valorCruzado: number;
  biaCreditos: number;
  nCruzados: number;
  diferenciaCount: number;
  diferenciaValor: number;
  porCuenta: { cuenta: string; count: number; valor: number }[];
};

const money = (v: unknown) =>
  v == null || v === ""
    ? "—"
    : "$" + Number(v).toLocaleString("es-CO", { maximumFractionDigits: 0 });

const PAGE = 50;

export function TransactionsDashboard({
  rows,
  kpis,
}: {
  period: string;
  rows: TxnView[];
  kpis: TxnKpis;
}) {
  const [search, setSearch] = useState("");
  const [metodo, setMetodo] = useState("");
  const [cuenta, setCuenta] = useState("");
  const [page, setPage] = useState(0);

  const metodos = useMemo(
    () => [...new Set(rows.map((r) => r.paymentMethod).filter(Boolean))].sort(),
    [rows],
  );
  const cuentas = useMemo(
    () => [...new Set(rows.map((r) => r.cuentaCruce))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      if (metodo && r.paymentMethod !== metodo) return false;
      if (cuenta && r.cuentaCruce !== cuenta) return false;
      if (q && !`${r.transactionId} ${r.billId} ${r.amount} ${r.cuentaCruce}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [rows, search, metodo, cuenta]);

  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.ceil(filtered.length / PAGE);
  const difBancoVsCruzado = kpis.valorRecaudadoBanco - kpis.valorCruzado;

  return (
    <div>
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Pagos en la base" value={kpis.cantidadPagos.toLocaleString("es-CO")} sub={`${money(kpis.totalAplicado)} · todas las formas de pago`} />
        <Kpi label="Recaudado en banco (cruzado)" value={money(kpis.valorRecaudadoBanco)} sub={`${kpis.nCruzados} pagos cruzados con bancos`} cls="text-success" />
        <Kpi label="Aplicado a facturas (cruzado)" value={money(kpis.valorCruzado)} sub={`dif. vs banco: ${money(difBancoVsCruzado)}`} cls={difBancoVsCruzado !== 0 ? "text-error" : "text-success"} />
        <Kpi label="Bia créditos usados" value={money(kpis.biaCreditos)} sub="aplicados con bonos" cls="text-primary" />
        <Kpi label="Diferencias" value={money(kpis.diferenciaValor)} sub={`${kpis.diferenciaCount} caso(s) banco ≠ aplicado`} cls={kpis.diferenciaCount ? "text-error" : "text-success"} />
      </div>

      {/* Por cuenta de cruce */}
      <div className="mt-4 rounded-xl border border-line bg-white p-4 shadow-sm">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Por cuenta de cruce</div>
        <div className="flex flex-wrap gap-3">
          {kpis.porCuenta.map((c) => (
            <div
              key={c.cuenta}
              className={`rounded-lg border px-4 py-2 ${
                c.cuenta === "Sin cruzar" ? "border-line bg-surface" : "border-primary-light bg-primary-light"
              }`}
            >
              <div className="text-xs text-ink-soft">{c.cuenta}</div>
              <div className="text-sm font-bold">{money(c.valor)}</div>
              <div className="text-xs text-ink-soft">{c.count} pagos</div>
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Buscar (txn id, factura, valor...)"
          className="h-10 min-w-[240px] rounded-md border border-line bg-white px-3 text-sm"
        />
        <select value={metodo} onChange={(e) => { setMetodo(e.target.value); setPage(0); }} className="h-10 rounded-md border border-line bg-white px-3 text-sm">
          <option value="">Método: Todos</option>
          {metodos.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={cuenta} onChange={(e) => { setCuenta(e.target.value); setPage(0); }} className="h-10 rounded-md border border-line bg-white px-3 text-sm">
          <option value="">Cuenta cruce: Todas</option>
          {cuentas.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="ml-auto text-sm text-ink-soft">{filtered.length.toLocaleString("es-CO")} filas</span>
      </div>

      {/* Tabla */}
      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Txn ID", "Bill", "Valor aplicado", "Bia créditos", "Total factura", "Método", "Estado", "Fecha pago", "Cuenta cruce", "Valor banco", "Diferencia"].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b border-line bg-surface px-3.5 py-2.5 text-left text-[11px] uppercase tracking-wide text-ink-soft">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={i} className="hover:bg-primary-light/40">
                  <td className="border-b border-line px-3.5 py-2.5 text-sm">{r.transactionId}</td>
                  <td className="border-b border-line px-3.5 py-2.5 text-sm">{r.billId}</td>
                  <td className="border-b border-line px-3.5 py-2.5 text-right text-sm tabular-nums">{money(r.amount)}</td>
                  <td className={`border-b border-line px-3.5 py-2.5 text-right text-sm tabular-nums ${r.biaCreditos ? "font-medium text-primary" : "text-ink-soft"}`}>{r.biaCreditos ? money(r.biaCreditos) : "—"}</td>
                  <td className="border-b border-line px-3.5 py-2.5 text-right text-sm font-medium tabular-nums">{money(r.totalFactura)}</td>
                  <td className="border-b border-line px-3.5 py-2.5 text-sm">{r.paymentMethod}</td>
                  <td className="border-b border-line px-3.5 py-2.5 text-sm">{r.status}</td>
                  <td className="border-b border-line px-3.5 py-2.5 text-sm">{r.paymentDate}</td>
                  <td className="border-b border-line px-3.5 py-2.5 text-sm">
                    {r.cuentaCruce === "Sin cruzar" ? (
                      <span className="rounded-md bg-surface px-2 py-1 text-xs text-ink-soft">Sin cruzar</span>
                    ) : (
                      <span className="rounded-md bg-success/15 px-2 py-1 text-xs font-medium text-success">{r.cuentaCruce}</span>
                    )}
                  </td>
                  <td className="border-b border-line px-3.5 py-2.5 text-right text-sm tabular-nums">{money(r.valorBanco)}</td>
                  <td className={`border-b border-line px-3.5 py-2.5 text-right text-sm tabular-nums ${r.diferencia ? "font-bold text-error" : ""}`}>
                    {r.diferencia == null ? "—" : money(r.diferencia)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40">Anterior</button>
          <span className="text-ink-soft">Página {page + 1} de {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40">Siguiente</button>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, cls, bar }: { label: string; value: string; sub: string; cls?: string; bar?: number }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${cls ?? ""}`}>{value}</div>
      <div className="mt-1 text-xs text-ink-soft">{sub}</div>
      {bar != null && (
        <div className="mt-2 h-1 overflow-hidden rounded bg-line">
          <div className="h-full bg-success" style={{ width: `${bar}%` }} />
        </div>
      )}
    </div>
  );
}
