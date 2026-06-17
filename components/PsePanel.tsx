"use client";

import { useMemo, useState } from "react";
import type { PseRow } from "@/lib/parsePse";
import { fmtDate, signClass, money } from "@/lib/format";

type Col = { key: keyof PseRow; label: string; num?: boolean };

const COLS: Col[] = [
  { key: "fecha", label: "Fecha" },
  { key: "hora", label: "Hora" },
  { key: "cus", label: "CUS" },
  { key: "bancoOriginador", label: "Banco originador" },
  { key: "pagador", label: "Pagador (NIT/CC)" },
  { key: "tipoUsuario", label: "Tipo" },
  { key: "valor", label: "Valor", num: true },
  { key: "estado", label: "Estado" },
];

// Detalle del recaudo PSE del 7772. Por ahora solo muestra el archivo (sin cruce):
// totales, filtros por banco/estado y tabla ordenable.
export function PsePanel({ rows, period }: { rows: PseRow[]; period: string }) {
  const [banco, setBanco] = useState("");
  const [estado, setEstado] = useState("");
  const [sortKey, setSortKey] = useState<keyof PseRow | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const bancos = useMemo(
    () => [...new Set(rows.map((r) => r.bancoOriginador).filter(Boolean))].sort(),
    [rows],
  );
  const estados = useMemo(
    () => [...new Set(rows.map((r) => r.estado).filter(Boolean))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    let r = rows.filter(
      (x) => (!banco || x.bancoOriginador === banco) && (!estado || x.estado === estado),
    );
    if (sortKey) {
      r = [...r].sort((a, b) => {
        const x = a[sortKey];
        const y = b[sortKey];
        if (typeof x === "number" && typeof y === "number") return sortAsc ? x - y : y - x;
        return sortAsc
          ? String(x).localeCompare(String(y))
          : String(y).localeCompare(String(x));
      });
    }
    return r;
  }, [rows, banco, estado, sortKey, sortAsc]);

  const aprobadas = rows.filter((r) => /aprob/i.test(r.estado));
  const totalAprob = aprobadas.reduce((s, r) => s + r.valor, 0);
  const totalFiltrado = filtered.reduce((s, r) => s + r.valor, 0);

  const kpis = [
    { lbl: "Transacciones", val: rows.length.toLocaleString("es-CO") },
    { lbl: "Aprobadas", val: aprobadas.length.toLocaleString("es-CO") },
    { lbl: "Total recaudado (aprobadas)", val: money(totalAprob) },
    { lbl: "Bancos originadores", val: bancos.length.toLocaleString("es-CO") },
  ];

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((c) => (
          <div key={c.lbl} className="rounded-xl border border-line bg-white p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-ink-soft">{c.lbl}</div>
            <div className="mt-1 text-2xl font-bold text-success">{c.val}</div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-ink-soft">
        Detalle del recaudo PSE de {period}. El cruce contra el extracto del 7772 y las facturas
        se definirá en una etapa posterior.
      </p>

      {/* Filtros */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          value={banco}
          onChange={(e) => setBanco(e.target.value)}
          className="h-10 rounded-md border border-line bg-white px-3 text-sm"
        >
          <option value="">Banco originador: Todos</option>
          {bancos.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="h-10 rounded-md border border-line bg-white px-3 text-sm"
        >
          <option value="">Estado: Todos</option>
          {estados.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="ml-auto text-sm text-ink-soft">
          {filtered.length} filas · {money(totalFiltrado)}
        </div>
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="mt-4 rounded-xl border border-line bg-surface px-6 py-12 text-center text-sm text-ink-soft">
          Sin transacciones PSE para este filtro.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => {
                        if (sortKey === c.key) setSortAsc(!sortAsc);
                        else {
                          setSortKey(c.key);
                          setSortAsc(true);
                        }
                      }}
                      className={`cursor-pointer whitespace-nowrap border-b border-line bg-surface px-3.5 py-2.5 text-[11px] uppercase tracking-wide text-ink-soft ${c.num ? "text-right" : "text-left"}`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr key={`${row.cus}-${i}`} className="hover:bg-primary-light/40">
                    {COLS.map((c) => (
                      <td
                        key={c.key}
                        className={`whitespace-nowrap border-b border-line px-3.5 py-2.5 text-sm ${c.num ? "text-right tabular-nums " + signClass(row[c.key]) : ""}`}
                      >
                        {c.num ? money(row[c.key]) : fmtDate(row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
