"use client";

import { useMemo, useState } from "react";
import type { FacturaDetalleRow, FacturaEstado } from "@/lib/db";
import { fmtDate, signClass, money } from "@/lib/format";

const ESTADO_BADGE: Record<FacturaEstado, string> = {
  "Pagado": "bg-success/15 text-success",
  "Pago Parcial": "bg-warning/20 text-warning",
  "Pendiente de Pago": "bg-error/15 text-error",
};

const ESTADOS: FacturaEstado[] = ["Pagado", "Pago Parcial", "Pendiente de Pago"];

// Detalle de TODAS las facturas del período (pagadas o no): estado de negocio,
// fecha de pago, valores (incl. valor pendiente con abonos) y contra qué cuenta cruzó.
export function FacturasDetalle({ rows }: { rows: FacturaDetalleRow[] }) {
  const [fEstado, setFEstado] = useState("");
  const [fCuenta, setFCuenta] = useState("");
  const [fFactura, setFFactura] = useState("");

  const cuentas = useMemo(() => [...new Set(rows.map((r) => r.cuentaCruce))].sort(), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!fEstado || r.estado === fEstado) &&
          (!fCuenta || r.cuentaCruce === fCuenta) &&
          (!fFactura || r.billId.includes(fFactura.trim())),
      ),
    [rows, fEstado, fCuenta, fFactura],
  );

  const sumFactura = filtered.reduce((s, r) => s + r.valorFactura, 0);
  const sumPendiente = filtered.reduce((s, r) => s + r.valorPendiente, 0);
  const sumAplicado = filtered.reduce((s, r) => s + r.valorAplicado, 0);
  const sumBia = filtered.reduce((s, r) => s + r.biaCreditos, 0);

  const th = "whitespace-nowrap border-b border-line bg-surface px-3 py-2.5 text-center text-[11px] uppercase tracking-wide text-ink-soft";
  const td = "whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-sm";
  const tdNum = `${td} tabular-nums`;

  return (
    <div className="mt-6 rounded-xl border border-line bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold">Detalle de facturas</h2>
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="h-9 rounded-md border border-line bg-white px-3 text-sm">
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fCuenta} onChange={(e) => setFCuenta(e.target.value)} className="h-9 rounded-md border border-line bg-white px-3 text-sm">
          <option value="">Toda cuenta cruce</option>
          {cuentas.map((c) => <option key={c || "—"} value={c}>{c || "Sin cruce"}</option>)}
        </select>
        <input value={fFactura} onChange={(e) => setFFactura(e.target.value)} placeholder="Buscar factura…" className="h-9 w-44 rounded-md border border-line bg-white px-3 text-sm" />
        <span className="ml-auto text-sm text-ink-soft">{filtered.length} de {rows.length}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface px-6 py-10 text-center text-sm text-ink-soft">
          Sin facturas para este filtro.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0">
                <tr>
                  {["Factura", "Período", "Status factura", "Fecha de pago", "Total Factura", "Total With Deposit", "Valor aplicado", "Bia créditos", "Estado", "Cuenta cruce"].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={`${r.billId}-${i}`} className="hover:bg-primary-light/40">
                    <td className={td}>{r.billId}</td>
                    <td className={td}>{r.period ?? "—"}</td>
                    <td className={td}>
                      <span className={`rounded-md px-2 py-1 text-xs font-bold ${r.status === "SUCCESS" ? "bg-success/15 text-success" : "bg-warning/20 text-warning"}`}>{r.status ?? "—"}</span>
                    </td>
                    <td className={td}>{r.fechaPago ? fmtDate(r.fechaPago) : "—"}</td>
                    <td className={`${tdNum} ${signClass(r.valorFactura)}`}>{money(r.valorFactura)}</td>
                    <td className={`${tdNum} ${signClass(r.valorPendiente)}`}>{r.valorPendiente ? money(r.valorPendiente) : "—"}</td>
                    <td className={`${tdNum} ${signClass(r.valorAplicado)}`}>{r.valorAplicado ? money(r.valorAplicado) : "—"}</td>
                    <td className={`${tdNum} ${signClass(r.biaCreditos)}`}>{r.biaCreditos ? money(r.biaCreditos) : "—"}</td>
                    <td className={td}>
                      <span className={`rounded-md px-2 py-1 text-xs font-bold ${ESTADO_BADGE[r.estado]}`}>{r.estado}</span>
                    </td>
                    <td className={td}>{r.cuentaCruce || "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-surface font-bold">
                  <td className={`${td} text-ink-soft`} colSpan={4}>Total</td>
                  <td className={`${tdNum} ${signClass(sumFactura)}`}>{money(sumFactura)}</td>
                  <td className={`${tdNum} ${signClass(sumPendiente)}`}>{money(sumPendiente)}</td>
                  <td className={`${tdNum} ${signClass(sumAplicado)}`}>{money(sumAplicado)}</td>
                  <td className={`${tdNum} ${signClass(sumBia)}`}>{money(sumBia)}</td>
                  <td className={td}></td>
                  <td className={td}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
