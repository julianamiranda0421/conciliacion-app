"use client";

import { useMemo, useState } from "react";
import type { CrossingDetailRow } from "@/lib/db";
import { accountLabel } from "@/lib/banks";
import { fmtDate, signClass, money } from "@/lib/format";

// Detalle de cruces: factura ↔ cuenta bancaria contra la que cruzó el pago
// (reemplaza la columna "Cuenta cruce" del antiguo módulo Transactions).
export function CrossingsTable({ rows }: { rows: CrossingDetailRow[] }) {
  const [fCuenta, setFCuenta] = useState("");
  const [fFactura, setFFactura] = useState("");

  const cuentas = useMemo(
    () => [...new Set(rows.map((r) => r.accountId))].sort(),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!fCuenta || r.accountId === fCuenta) &&
          (!fFactura || r.billId.includes(fFactura.trim()) || String(r.transactionId).includes(fFactura.trim())),
      ),
    [rows, fCuenta, fFactura],
  );

  const sumBanco = filtered.reduce((s, r) => s + r.valorBanco, 0);
  const sumAplicado = filtered.reduce((s, r) => s + r.valorAplicado, 0);
  const sumDif = filtered.reduce((s, r) => s + r.diferencia, 0);

  const th = "whitespace-nowrap border-b border-line bg-surface px-3 py-2.5 text-center text-[11px] uppercase tracking-wide text-ink-soft";
  const td = "whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-sm";
  const tdNum = `${td} tabular-nums`;

  return (
    <div className="mt-6">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Detalle de cruces (factura ↔ cuenta)
        </h3>
        <select
          value={fCuenta}
          onChange={(e) => setFCuenta(e.target.value)}
          className="h-9 rounded-md border border-line bg-white px-3 text-sm"
        >
          <option value="">Todas las cuentas</option>
          {cuentas.map((c) => (
            <option key={c} value={c}>{accountLabel(c)}</option>
          ))}
        </select>
        <input
          value={fFactura}
          onChange={(e) => setFFactura(e.target.value)}
          placeholder="Buscar factura / transacción…"
          className="h-9 w-56 rounded-md border border-line bg-white px-3 text-sm"
        />
        <span className="ml-auto text-sm text-ink-soft">{filtered.length} de {rows.length}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface px-6 py-10 text-center text-sm text-ink-soft">
          Sin cruces para este filtro.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Factura", "TransacciónID", "Cuenta cruce", "Valor banco", "Valor aplicado", "Diferencia", "Fecha banco", "Tipo"].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={`${r.transactionId}-${i}`} className="hover:bg-primary-light/40">
                    <td className={td}>{r.billId}</td>
                    <td className={tdNum}>{r.transactionId}</td>
                    <td className={td}>{accountLabel(r.accountId)}</td>
                    <td className={`${tdNum} ${signClass(r.valorBanco)}`}>{money(r.valorBanco)}</td>
                    <td className={`${tdNum} ${signClass(r.valorAplicado)}`}>{money(r.valorAplicado)}</td>
                    <td className={`${tdNum} ${r.diferencia !== 0 ? "font-bold text-error" : ""}`}>{money(r.diferencia)}</td>
                    <td className={td}>{fmtDate(r.fechaBanco)}</td>
                    <td className={td}>{r.tipo}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-surface font-bold">
                  <td className={`${td} text-ink-soft`} colSpan={3}>Total</td>
                  <td className={`${tdNum} ${signClass(sumBanco)}`}>{money(sumBanco)}</td>
                  <td className={`${tdNum} ${signClass(sumAplicado)}`}>{money(sumAplicado)}</td>
                  <td className={`${tdNum} ${sumDif !== 0 ? "font-bold text-error" : ""}`}>{money(sumDif)}</td>
                  <td className={td} colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
