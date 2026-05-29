"use client";

import { useMemo, useState } from "react";
import type { ReconResult } from "@/lib/reconcile";

const money = (v: unknown) =>
  v == null || v === ""
    ? ""
    : "$" + Number(v).toLocaleString("es-CO", { maximumFractionDigits: 0 });

type Col = { key: string; label: string; num?: boolean };
type TabDef = {
  id: keyof ReconResult;
  label: string;
  cols: Col[];
  filters?: { key: string; label: string }[];
};

const TABS: TabDef[] = [
  {
    id: "conciliado",
    label: "✅ Conciliado",
    filters: [
      { key: "tipo", label: "Tipo" },
      { key: "nivelMatch", label: "Match" },
    ],
    cols: [
      { key: "transactionId", label: "Txn ID" },
      { key: "billIdTxn", label: "Bill (txn)" },
      { key: "billIdBanco", label: "Bill (banco)" },
      { key: "valorBanco", label: "Valor banco", num: true },
      { key: "valorAplicado", label: "Valor aplicado", num: true },
      { key: "diferencia", label: "Diferencia", num: true },
      { key: "fechaBanco", label: "Fecha banco" },
      { key: "fechaPago", label: "Fecha pago" },
      { key: "sucursal", label: "Punto" },
      { key: "tipo", label: "Tipo" },
      { key: "nivelMatch", label: "Match" },
    ],
  },
  {
    id: "bancoSinTxn",
    label: "⚠️ En Banco, sin transaction ID",
    filters: [{ key: "descripcion", label: "Concepto" }],
    cols: [
      { key: "fechaBanco", label: "Fecha" },
      { key: "descripcion", label: "Concepto" },
      { key: "sucursal", label: "Punto" },
      { key: "billId", label: "Bill" },
      { key: "documento", label: "Documento" },
      { key: "valorBanco", label: "Valor", num: true },
      { key: "nota", label: "Nota" },
    ],
  },
  {
    id: "txnSinBanco",
    label: "⚠️ En transactions, sin mov Bancario",
    filters: [{ key: "tipo", label: "Tipo" }],
    cols: [
      { key: "transactionId", label: "Txn ID" },
      { key: "billId", label: "Bill" },
      { key: "valorAplicado", label: "Valor", num: true },
      { key: "fechaPago", label: "Fecha pago" },
      { key: "tipo", label: "Tipo" },
      { key: "nota", label: "Nota" },
    ],
  },
  {
    id: "movimientos",
    label: "🏦 Movimientos bancarios",
    filters: [
      { key: "descripcion", label: "Concepto" },
      { key: "sucursal", label: "Canal" },
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
    filters: [{ key: "riesgo", label: "Riesgo" }],
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
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const tab = TABS.find((t) => t.id === current)!;
  const rawRows = (result[current] as Record<string, unknown>[]) ?? [];

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    let r = rawRows.filter((row) => {
      if (q && !Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(q)))
        return false;
      for (const k in filters) if (String(row[k]) !== filters[k]) return false;
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
  }, [rawRows, search, filters, sortKey, sortAsc]);

  const k = result.resumen;
  const total = k.totalConc + k.totalBst;
  const pct = total > 0 ? Math.round((k.totalConc / total) * 100) : 100;

  const kpis = [
    { cls: "ok", lbl: "Conciliado", val: money(k.totalConc), sub: `${k.nConc} mov · ${pct}%`, bar: pct },
    { cls: "warn", lbl: "En Banco, sin transaction ID", val: money(k.totalBst), sub: `${k.nBst} mov` },
    { cls: "warn", lbl: "En transactions, sin mov Bancario", val: money(k.totalTsb), sub: `${k.nTsb} mov` },
    { cls: k.nCritico ? "bad" : "warn", lbl: "Cheques devueltos", val: String(k.nDev), sub: `${k.nCritico} críticos` },
    { cls: k.descuadre ? "bad" : "ok", lbl: "Diferencia", val: String(k.descuadre), sub: "casos con diferencia" },
  ];

  const valClass = (cls: string) =>
    cls === "ok" ? "text-success" : cls === "warn" ? "text-warning" : "text-error";

  return (
    <div>
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
                setSearch("");
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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar (factura, valor, sucursal...)"
          className="h-10 min-w-[260px] rounded-md border border-line bg-white px-3 text-sm"
        />
        {tab.filters?.map((f) => {
          const vals = [...new Set(rawRows.map((r) => r[f.key]).filter((v) => v != null && v !== ""))]
            .map(String)
            .sort();
          return (
            <select
              key={f.key}
              value={filters[f.key] ?? ""}
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
  return <td className={base}>{value == null ? "" : String(value)}</td>;
}
