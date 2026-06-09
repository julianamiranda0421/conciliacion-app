"use client";

import { useMemo, useState } from "react";
import type { ReconResult } from "@/lib/reconcile";

const money = (v: unknown) =>
  v == null || v === ""
    ? ""
    : "$" + Number(v).toLocaleString("es-CO", { maximumFractionDigits: 0 });

type Col = { key: string; label: string; num?: boolean };
type FilterType = "text" | "select" | "multi";
type FilterDef = { key: string; label: string; type?: FilterType };
type TabDef = {
  id: keyof ReconResult;
  label: string;
  cols: Col[];
  filters?: FilterDef[];
};

const TABS: TabDef[] = [
  {
    id: "conciliado",
    label: "✅ Conciliado",
    filters: [
      { key: "billIdTxn", label: "Factura", type: "text" },
      { key: "tipo", label: "Tipo", type: "select" },
      { key: "statusFactura", label: "Status factura", type: "multi" },
    ],
    cols: [
      { key: "transactionId", label: "TransacciónID" },
      { key: "billIdTxn", label: "Factura" },
      { key: "billIdBanco", label: "Factura Banco" },
      { key: "periodoFactura", label: "Período factura" },
      { key: "descripcion", label: "Descripción" },
      { key: "valorFactura", label: "Valor factura", num: true },
      { key: "valorBanco", label: "Valor banco", num: true },
      { key: "valorAplicado", label: "Valor aplicado", num: true },
      { key: "biaCreditos", label: "Bia créditos", num: true },
      { key: "diferencia", label: "Diferencia", num: true },
      { key: "fechaBanco", label: "Fecha banco" },
      { key: "tipo", label: "Tipo" },
      { key: "statusFactura", label: "Status factura" },
    ],
  },
  {
    id: "pendientes",
    label: "🟠 Partidas Conciliatorias Pendientes",
    filters: [{ key: "status", label: "Status", type: "select" }],
    cols: [
      { key: "fecha", label: "Fecha" },
      { key: "concepto", label: "Concepto" },
      { key: "punto", label: "Punto" },
      { key: "billId", label: "Factura" },
      { key: "valor", label: "Valor", num: true },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "movimientos",
    label: "🏦 Movimientos bancarios",
    filters: [
      { key: "descripcion", label: "Concepto", type: "select" },
      { key: "fecha", label: "Fecha de ingreso", type: "select" },
    ],
    cols: [
      { key: "fecha", label: "Fecha" },
      { key: "descripcion", label: "Concepto" },
      { key: "sucursal", label: "Canal" },
      { key: "valor", label: "Valor", num: true },
    ],
  },
  {
    id: "dev",
    label: "🚨 Cheques devueltos",
    cols: [
      { key: "fechaDev", label: "Fecha DEV" },
      { key: "documento", label: "Documento" },
      { key: "valor", label: "Valor", num: true },
      { key: "facturasAsociadas", label: "Facturas" },
      { key: "reconsignado", label: "Reconsignado" },
      { key: "riesgo", label: "Riesgo" },
    ],
  },
];

export function Dashboard({ result }: { result: ReconResult }) {
  const [current, setCurrent] = useState<keyof ReconResult>("conciliado");
  const [filters, setFilters] = useState<Record<string, string | string[]>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const tab = TABS.find((t) => t.id === current)!;
  const rawRows = (result[current] as Record<string, unknown>[]) ?? [];
  const filterType = (key: string): FilterType =>
    tab.filters?.find((f) => f.key === key)?.type ?? "select";

  const rows = useMemo(() => {
    let r = rawRows.filter((row) => {
      for (const k in filters) {
        const fv = filters[k];
        const cell = String(row[k] ?? "");
        if (Array.isArray(fv)) {
          if (fv.length && !fv.includes(cell)) return false;
        } else if (fv) {
          if (filterType(k) === "text") {
            if (!cell.toLowerCase().includes(fv.toLowerCase())) return false;
          } else if (cell !== fv) {
            return false;
          }
        }
      }
      return true;
    });
    if (sortKey) {
      r = [...r].sort((a, b) => {
        const x = a[sortKey] as never;
        const y = b[sortKey] as never;
        if (typeof x === "number" && typeof y === "number") return sortAsc ? x - y : y - x;
        return sortAsc
          ? String(x).localeCompare(String(y))
          : String(y).localeCompare(String(x));
      });
    }
    return r;
  }, [rawRows, filters, sortKey, sortAsc]);

  const k = result.resumen;
  const pctConc = k.totalIngresoBanco > 0 ? Math.round((k.totalConc / k.totalIngresoBanco) * 100) : 0;

  const kpis = [
    { cls: "ok", lbl: "Total ingreso al banco", val: money(k.totalIngresoBanco), sub: k.totalDevValor > 0 ? "neto (− cheques devueltos)" : "recaudo recibido", bar: pctConc },
    { cls: "ok", lbl: "Total ingreso conciliado", val: money(k.totalConc), sub: `${k.nConc} cruces · ${pctConc}% del ingreso` },
    { cls: k.totalDevValor > 0 ? "bad" : "ok", lbl: "Cheques devueltos", val: money(k.totalDevValor), sub: `${k.nDev} cheque(s) · ${k.nCritico} crítico(s)` },
    { cls: Math.abs(k.totalPendiente) > 1 ? "bad" : "ok", lbl: "Pendiente por conciliar", val: money(k.totalPendiente), sub: "ingreso al banco − conciliado" },
  ];

  const valClass = (cls: string) =>
    cls === "ok" ? "text-success" : cls === "warn" ? "text-warning" : "text-error";

  return (
    <div>
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((c) => (
          <div key={c.lbl} className="rounded-xl border border-line bg-white p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-ink-soft">{c.lbl}</div>
            <div className={`mt-1 text-2xl font-bold ${valClass(c.cls)}`}>{c.val}</div>
            <div className="mt-1 text-xs text-ink-soft">{c.sub}</div>
            {c.bar != null && (
              <div className="mt-2 h-1 overflow-hidden rounded bg-line">
                <div className="h-full bg-success" style={{ width: `${c.bar}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const n = (result[t.id] as unknown[])?.length ?? 0;
          const active = t.id === current;
          return (
            <button
              key={t.id}
              onClick={() => {
                setCurrent(t.id);
                setSortKey(null);
                setFilters({});
              }}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                active
                  ? "border-primary bg-primary text-white"
                  : "border-line bg-white text-ink-soft hover:border-primary hover:text-primary"
              }`}
            >
              {t.label} <span className="opacity-60">({n})</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {tab.filters?.map((f) => {
          const vals = [...new Set(rawRows.map((r) => r[f.key]).filter((v) => v != null && v !== ""))]
            .map(String)
            .sort();

          // Filtro de texto (contiene)
          if (f.type === "text") {
            return (
              <input
                key={f.key}
                value={(filters[f.key] as string) ?? ""}
                onChange={(e) =>
                  setFilters((prev) => {
                    const next = { ...prev };
                    if (e.target.value) next[f.key] = e.target.value;
                    else delete next[f.key];
                    return next;
                  })
                }
                placeholder={f.label}
                className="h-10 w-40 rounded-md border border-line bg-white px-3 text-sm"
              />
            );
          }

          // Filtro multi-selección (chips)
          if (f.type === "multi") {
            const sel = (filters[f.key] as string[]) ?? [];
            return (
              <div key={f.key} className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm text-ink-soft">{f.label}:</span>
                {vals.map((v) => {
                  const on = sel.includes(v);
                  return (
                    <button
                      key={v}
                      onClick={() =>
                        setFilters((prev) => {
                          const cur = Array.isArray(prev[f.key]) ? [...(prev[f.key] as string[])] : [];
                          const i = cur.indexOf(v);
                          if (i >= 0) cur.splice(i, 1);
                          else cur.push(v);
                          const next = { ...prev };
                          if (cur.length) next[f.key] = cur;
                          else delete next[f.key];
                          return next;
                        })
                      }
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        on
                          ? "border-primary bg-primary text-white"
                          : "border-line bg-white text-ink-soft hover:border-primary"
                      }`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            );
          }

          // Filtro de selección simple
          return (
            <select
              key={f.key}
              value={(filters[f.key] as string) ?? ""}
              onChange={(e) =>
                setFilters((prev) => {
                  const next = { ...prev };
                  if (e.target.value) next[f.key] = e.target.value;
                  else delete next[f.key];
                  return next;
                })
              }
              className="h-10 rounded-md border border-line bg-white px-3 text-sm"
            >
              <option value="">{f.label}: Todos</option>
              {vals.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          );
        })}
        <span className="ml-auto text-sm text-ink-soft">{rows.length} filas</span>
      </div>

      {current === "dev" && rows.length > 0 && (
        <div className="mt-3 rounded-md border border-error bg-error/5 px-4 py-3 text-sm">
          🚨 <b>{rows.length} cheque(s) devuelto(s)</b>.{" "}
          {result.dev.filter((d) => d.riesgo.startsWith("CRITICO")).length} con riesgo CRÍTICO
          (factura marcada como pagada pero el dinero no entró). Revisar cada caso.
        </div>
      )}

      {/* Tabla */}
      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-line bg-surface px-6 py-12 text-center text-sm text-ink-soft">
          Sin registros en esta categoría ✓
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {tab.cols.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => {
                        if (sortKey === c.key) setSortAsc(!sortAsc);
                        else {
                          setSortKey(c.key);
                          setSortAsc(true);
                        }
                      }}
                      className="cursor-pointer whitespace-nowrap border-b border-line bg-surface px-3.5 py-2.5 text-left text-[11px] uppercase tracking-wide text-ink-soft"
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-primary-light/40">
                    {tab.cols.map((c) => (
                      <Cell key={c.key} col={c} value={row[c.key]} />
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

function Cell({ col, value }: { col: Col; value: unknown }) {
  const base = "whitespace-nowrap border-b border-line px-3.5 py-2.5 text-sm";
  if (col.num) {
    const diff = col.key === "diferencia" && Number(value) !== 0;
    return (
      <td className={`${base} text-right tabular-nums ${diff ? "font-bold text-error" : ""}`}>
        {money(value)}
      </td>
    );
  }
  if (col.key === "nivelMatch") {
    const alto = value === "ALTO";
    return (
      <td className={base}>
        <span
          className={`rounded-md px-2 py-1 text-xs font-bold ${
            alto ? "bg-success/15 text-success" : "bg-warning/20 text-warning"
          }`}
        >
          {String(value)}
        </span>
      </td>
    );
  }
  if (col.key === "reconsignado") {
    return <td className={base}>{value ? "Sí" : "No"}</td>;
  }
  if (col.key === "statusFactura") {
    const ok = value === "SUCCESS";
    return (
      <td className={base}>
        <span
          className={`rounded-md px-2 py-1 text-xs font-bold ${
            ok ? "bg-success/15 text-success" : "bg-warning/20 text-warning"
          }`}
        >
          {String(value ?? "")}
        </span>
      </td>
    );
  }
  if (col.key === "status") {
    const critico = value === "Cheque devuelto";
    return (
      <td className={base}>
        <span
          className={`rounded-md px-2 py-1 text-xs font-bold ${
            critico ? "bg-error/10 text-error" : "bg-warning/20 text-warning"
          }`}
        >
          {String(value ?? "")}
        </span>
      </td>
    );
  }
  return <td className={base}>{value == null ? "" : String(value)}</td>;
}
