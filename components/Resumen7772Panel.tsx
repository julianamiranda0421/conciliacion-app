"use client";

import { useMemo, useState } from "react";
import type { Resumen7772 } from "@/lib/resumen7772";

const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

export function Resumen7772Panel({ resumen }: { resumen: Resumen7772 }) {
  const [fConcepto, setFConcepto] = useState("");
  const [fTran, setFTran] = useState("");

  const conceptos = useMemo(
    () => [...new Set(resumen.movimientos.map((m) => m.descripcion))].sort(),
    [resumen.movimientos],
  );
  const movs = useMemo(
    () =>
      resumen.movimientos.filter(
        (m) => (!fConcepto || m.descripcion === fConcepto) && (!fTran || m.tran === fTran),
      ),
    [resumen.movimientos, fConcepto, fTran],
  );

  return (
    <div>
      <p className="text-sm text-ink-soft">
        Todo lo que ingresó a la cuenta 7772 en el período, clasificado por canal de recaudo.
        Cada canal se concilia en su propia pestaña.
      </p>

      {/* Ingreso total + desglose por canal */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-primary/30 bg-primary-light/40 p-4 shadow-sm">
          <div className="text-xs font-medium text-ink-soft">Total ingreso al banco</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-primary">{cop(resumen.totalIngreso)}</div>
          <div className="mt-1 text-xs text-ink-soft">{resumen.nMovimientos} movimientos en el extracto</div>
        </div>
        {resumen.canales.map((c) => (
          <div key={c.key} className="rounded-xl border border-line bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-ink-soft">{c.label}</div>
            <div className="mt-1 text-xl font-bold tabular-nums">{cop(c.valor)}</div>
            <div className="mt-1 text-xs text-ink-soft">
              {c.n} mov · {resumen.totalIngreso ? Math.round((c.valor / resumen.totalIngreso) * 100) : 0}%
            </div>
          </div>
        ))}
      </div>

      {/* Movimientos bancarios completos */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold">Movimientos bancarios (extracto completo)</h3>
        <select value={fConcepto} onChange={(e) => setFConcepto(e.target.value)} className="h-9 max-w-[280px] rounded-md border border-line bg-white px-3 text-sm">
          <option value="">Todo concepto</option>
          {conceptos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fTran} onChange={(e) => setFTran(e.target.value)} className="h-9 rounded-md border border-line bg-white px-3 text-sm">
          <option value="">Todo Tran</option>
          <option value="Nota Crédito">Nota Crédito</option>
          <option value="Nota Débito">Nota Débito</option>
        </select>
        <span className="text-sm text-ink-soft">{movs.length} de {resumen.movimientos.length}</span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["Fecha", "Concepto", "Tran", "Valor"].map((h) => (
                <th key={h} className="whitespace-nowrap border-b border-line bg-surface px-3 py-2 text-left text-[11px] uppercase tracking-wide text-ink-soft">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movs.map((m, i) => (
              <tr key={i} className="hover:bg-primary-light/40">
                <td className="whitespace-nowrap border-b border-line px-3 py-2">{m.fecha}</td>
                <td className="border-b border-line px-3 py-2">{m.descripcion}</td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2 text-xs text-ink-soft">{m.tran}</td>
                <td className={`border-b border-line px-3 py-2 text-right tabular-nums ${m.valor < 0 ? "text-error" : ""}`}>{cop(m.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
