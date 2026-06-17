"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, Download } from "lucide-react";
import * as XLSX from "xlsx";
import type { ReconResult } from "@/lib/reconcile";
import { accountLabel } from "@/lib/banks";
import { fmtDate, signClass, money } from "@/lib/format";

type Col = { key: string; label: string; num?: boolean };
type FilterType = "text" | "select" | "multi";
type FilterDef = { key: string; label: string; type?: FilterType };
type TabDef = {
  id: keyof ReconResult;
  label: string;
  cols: Col[];
  filters?: FilterDef[];
  total?: boolean; // muestra fila de Total al pie (suma las columnas numéricas)
};

const TAB_CONCILIADO: TabDef = {
  id: "conciliado",
  label: "Recaudo Conciliado",
  filters: [
    { key: "billIdTxn", label: "Factura", type: "text" },
    { key: "tipo", label: "Tipo Recaudo", type: "select" },
    { key: "statusFactura", label: "Status factura", type: "multi" },
  ],
  cols: [
    { key: "transactionId", label: "ID" },
    { key: "billIdBanco", label: "Factura" },
    { key: "billIdTxn", label: "Factura aplicada" },
    { key: "periodoFactura", label: "Período" },
    { key: "descripcion", label: "Descripción" },
    { key: "valorFactura", label: "Valor factura Bia", num: true },
    { key: "valorBanco", label: "Ingreso Bancario", num: true },
    { key: "biaCreditos", label: "Bia créditos", num: true },
    { key: "valorAplicado", label: "Valor aplicado", num: true },
    { key: "diferencia", label: "Diferencia", num: true },
    { key: "tipo", label: "Tipo Recaudo" },
    { key: "statusFactura", label: "Status factura" },
    { key: "pago", label: "Pago" },
    { key: "fechaBanco", label: "Fecha Ingreso" },
    { key: "observacion", label: "Observaciones" },
  ],
};

// 8465 (recaudo PDF)
const TAB_PENDIENTES: TabDef = {
  id: "pendientes",
  label: "Partidas Conciliatorias Pendientes",
  total: true,
  filters: [{ key: "status", label: "Status", type: "select" }],
  cols: [
    { key: "fecha", label: "Fecha" },
    { key: "concepto", label: "Concepto" },
    { key: "punto", label: "Punto" },
    { key: "billId", label: "Factura" },
    { key: "valor", label: "Valor", num: true },
    { key: "status", label: "Status" },
  ],
};
const TAB_DEV: TabDef = {
  id: "dev",
  label: "Cheques devueltos",
  total: true,
  cols: [
    { key: "fechaDev", label: "Fecha DEV" },
    { key: "documento", label: "Documento" },
    { key: "descripcion", label: "Descripción" },
    { key: "valor", label: "Valor", num: true },
    { key: "facturasAsociadas", label: "Facturas" },
    { key: "reconsignado", label: "Reconsignado" },
    { key: "observacion", label: "Observaciones" },
  ],
};

// Cuentas ACH (Davivienda, 1800, 1144): clasificación manual recaudo / otros
const TAB_RECAUDO: TabDef = {
  id: "recaudoPendiente",
  label: "Partidas conciliatorias recaudo",
  cols: [
    { key: "fecha", label: "Fecha" },
    { key: "concepto", label: "Concepto" },
    { key: "punto", label: "Punto" },
    { key: "billId", label: "Factura" },
    { key: "valor", label: "Valor", num: true },
    { key: "accion", label: "Acción" },
  ],
};
const TAB_OTROS: TabDef = {
  id: "otrosIngresos",
  label: "Otros ingresos",
  filters: [{ key: "concepto", label: "Concepto", type: "select" }],
  cols: [
    { key: "fecha", label: "Fecha" },
    { key: "concepto", label: "Concepto" },
    { key: "punto", label: "Punto" },
    { key: "valor", label: "Valor", num: true },
    { key: "accion", label: "Acción" },
  ],
};

const TAB_MOV: TabDef = {
  id: "movimientos",
  label: "Movimientos bancarios",
  filters: [
    { key: "tran", label: "Tran", type: "select" },
    { key: "descripcion", label: "Concepto", type: "select" },
    { key: "fecha", label: "Fecha de ingreso", type: "select" },
  ],
  cols: [
    { key: "fecha", label: "Fecha" },
    { key: "descripcion", label: "Concepto" },
    { key: "sucursal", label: "Canal" },
    { key: "tran", label: "Tran" },
    { key: "valor", label: "Valor", num: true },
  ],
};

export function Dashboard({
  result,
  accountId,
  period,
}: {
  result: ReconResult;
  accountId: string;
  period: string;
}) {
  const router = useRouter();
  const isAch = Array.isArray(result.otrosIngresos);
  const TABS = isAch
    ? [TAB_CONCILIADO, TAB_RECAUDO, TAB_OTROS, TAB_MOV]
    : [TAB_CONCILIADO, TAB_PENDIENTES, TAB_DEV, TAB_MOV];

  const [current, setCurrent] = useState<keyof ReconResult>("conciliado");
  const [filters, setFilters] = useState<Record<string, string | string[]>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savedId, setSavedId] = useState<string | null>(null);

  // Guarda la observación de una partida conciliada (por transaction_id).
  // Muestra un ✓ al guardar y avisa si falla (antes el error se tragaba en silencio).
  async function saveNote(transactionId: string, texto: string) {
    if (!transactionId) return;
    try {
      const res = await fetch("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, accountId, transactionId: Number(transactionId), texto }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "No se pudo guardar la observación");
        return;
      }
      setSavedId(transactionId);
      setTimeout(() => setSavedId((s) => (s === transactionId ? null : s)), 1500);
    } catch {
      alert("No se pudo guardar la observación (sin conexión)");
    }
  }

  // Guarda la observación de un cheque devuelto (clave = documento del cheque).
  async function saveDevNote(documento: string, texto: string) {
    if (!documento) return;
    const key = "dev:" + documento;
    try {
      const res = await fetch("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, accountId, documento, texto }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "No se pudo guardar la observación");
        return;
      }
      setSavedId(key);
      setTimeout(() => setSavedId((s) => (s === key ? null : s)), 1500);
    } catch {
      alert("No se pudo guardar la observación (sin conexión)");
    }
  }

  const tab = TABS.find((t) => t.id === current) ?? TABS[0];
  const rawRows = (result[tab.id] as Record<string, unknown>[]) ?? [];
  const filterType = (key: string): FilterType =>
    tab.filters?.find((f) => f.key === key)?.type ?? "select";

  // Marcar (on=true) o desmarcar (on=false) un movimiento como recaudo.
  async function setRecaudo(sig: string, on: boolean) {
    if (!sig) return;
    setBusy(sig);
    try {
      const res = await fetch("/api/movement-flags", {
        method: on ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, accountId, sig }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "No se pudo guardar la clasificación");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

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

  // Descarga el detalle conciliado del período actual en un libro de Excel:
  // una hoja de Resumen (KPIs) + una hoja por cada pestaña con sus columnas.
  function exportExcel() {
    const wb = XLSX.utils.book_new();

    // Hoja Resumen: encabezado de la cuenta/período y KPIs.
    const resumenAoa: (string | number)[][] = [
      ["Conciliación bancaria"],
      ["Cuenta", accountLabel(accountId)],
      ["Período", period],
      [],
      ["Total ingreso al banco", k.totalIngresoBanco],
      ["Total ingreso conciliado", k.totalConc],
      ["Cruces conciliados", k.nConc],
      isAch
        ? ["Diferencia", k.diferenciaValor]
        : ["Cheques devueltos (valor)", k.totalDevValor],
      ["Pendiente por conciliar", k.totalPendiente],
    ];
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenAoa);
    wsResumen["!cols"] = [{ wch: 28 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

    // Una hoja por pestaña, usando las mismas columnas/etiquetas de la vista.
    for (const t of TABS) {
      const data = (result[t.id] as Record<string, unknown>[]) ?? [];
      const headers = t.cols.map((c) => c.label);
      const aoa = data.map((row) =>
        t.cols.map((c) => {
          const v = row[c.key];
          if (c.num) return v == null || v === "" ? "" : Number(v);
          return v == null ? "" : String(v);
        }),
      );
      const ws = XLSX.utils.aoa_to_sheet([headers, ...aoa]);
      ws["!cols"] = t.cols.map((c) => ({ wch: c.num ? 16 : Math.max(c.label.length + 2, 14) }));
      // Nombre de hoja: sin emojis y máx. 31 caracteres (límite de Excel).
      const name =
        t.label.replace(/[^\p{L}\p{N} ]/gu, "").trim().slice(0, 31) || String(t.id);
      XLSX.utils.book_append_sheet(wb, ws, name);
    }

    const safe = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
    XLSX.writeFile(wb, `Conciliacion_${safe(accountLabel(accountId))}_${safe(period)}.xlsx`);
  }

  const k = result.resumen;
  const pctConc = k.totalIngresoBanco > 0 ? Math.round((k.totalConc / k.totalIngresoBanco) * 100) : 0;

  type Kpi = { cls: string; lbl: string; val: string; sub?: string; bar?: number };
  const kpis: Kpi[] = [
    // Total ingreso bancario: sin subtítulo (el título resaltado va en negrita como los demás).
    { cls: "ok", lbl: "Total Ingreso Bancario", val: money(k.totalIngresoBanco) },
    { cls: "ok", lbl: "Recaudo Conciliado", val: money(k.totalConc), sub: `${k.nConc} cruces · ${pctConc}% del ingreso bancario` },
    { cls: Math.abs(k.totalPendiente) > 1 ? "bad" : "ok", lbl: "Pendiente por Conciliar", val: money(k.totalPendiente), sub: isAch ? "solo recaudo pendiente" : "Ingreso Bancario − Recaudo" },
    isAch
      ? { cls: k.diferenciaValor > 1 ? "bad" : "ok", lbl: "Diferencia", val: money(k.diferenciaValor), sub: `${k.descuadre} caso(s) con diferencia` }
      : { cls: k.totalDevValor > 0 ? "bad" : "ok", lbl: "Cheques devueltos", val: money(-k.totalDevValor), sub: `${k.nDev} cheque(s)` },
    // % de lo que ingresó al banco que se cruzó como recaudo.
    { cls: "ok", lbl: "% Recaudo / Ingreso bancario", val: `${pctConc}%`, sub: "recaudo conciliado vs ingreso", bar: pctConc },
  ];

  const valClass = (cls: string) =>
    cls === "ok" ? "text-success" : cls === "warn" ? "text-warning" : "text-error";

  return (
    <div>
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.map((c) => (
          <div key={c.lbl} className="rounded-xl border border-line bg-white p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{c.lbl}</div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${valClass(c.cls)}`}>{c.val}</div>
            {c.sub && <div className="mt-1 text-xs text-ink-soft">{c.sub}</div>}
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
          const active = t.id === tab.id;
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
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={exportExcel}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm text-ink-soft transition hover:border-success hover:text-success"
            title={`Descargar el detalle de ${period} en Excel`}
          >
            <Download className="h-4 w-4" />
            Descargar Excel
          </button>
          <span className="text-sm text-ink-soft">{rows.length} filas</span>
        </div>
      </div>

      {tab.id === "dev" && rows.length > 0 && (
        <div className="mt-3 rounded-md border border-error bg-error/5 px-4 py-3 text-sm">
          🚨 <b>{rows.length} cheque(s) devuelto(s)</b>.{" "}
          {result.dev.filter((d) => d.riesgo.startsWith("CRITICO")).length} con riesgo CRÍTICO
          (factura marcada como pagada pero el dinero no entró). Revisar cada caso.
        </div>
      )}
      {tab.id === "otrosIngresos" && (
        <p className="mt-3 text-xs text-ink-soft">
          Usa <b>Marcar recaudo</b> en las partidas que sean recaudo; pasarán a “Partidas conciliatorias recaudo”.
        </p>
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
                      className="cursor-pointer whitespace-nowrap border-b border-line bg-surface px-3.5 py-2.5 text-center text-[11px] uppercase tracking-wide text-ink-soft"
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const sig = String(row.sig ?? "");
                  const rowBusy = busy === sig && sig !== "";
                  return (
                    <tr key={i} className="hover:bg-primary-light/40">
                      {tab.cols.map((c) => {
                        // Conciliado: observaciones editables (se guardan al salir del campo)
                        if (tab.id === "conciliado" && c.key === "observacion") {
                          const id = String(row.transactionId ?? "");
                          const val = notes[id] ?? String(row.observacion ?? "");
                          const hasDiff = Number(row.diferencia) !== 0;
                          return (
                            <td key={c.key} className="whitespace-nowrap border-b border-line px-3.5 py-2.5 text-center text-sm">
                              <div className="flex items-center justify-center gap-1.5">
                                <input
                                  value={val}
                                  onChange={(e) => setNotes((p) => ({ ...p, [id]: e.target.value }))}
                                  onBlur={(e) => saveNote(id, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.currentTarget.blur();
                                  }}
                                  placeholder={hasDiff ? "Anota la diferencia…" : "—"}
                                  className={`h-8 w-52 rounded-md border px-2 text-xs ${
                                    hasDiff ? "border-error/50 bg-error/5" : "border-line"
                                  }`}
                                />
                                {savedId === id && (
                                  <span className="text-xs font-medium text-success">✓</span>
                                )}
                              </div>
                            </td>
                          );
                        }
                        // Cheques devueltos: observación editable (clave = documento del cheque)
                        if (tab.id === "dev" && c.key === "observacion") {
                          const doc = String(row.documento ?? "");
                          const key = "dev:" + doc;
                          const val = notes[key] ?? String(row.observacion ?? "");
                          return (
                            <td key={c.key} className="whitespace-nowrap border-b border-line px-3.5 py-2.5 text-center text-sm">
                              <div className="flex items-center justify-center gap-1.5">
                                <input
                                  value={val}
                                  onChange={(e) => setNotes((p) => ({ ...p, [key]: e.target.value }))}
                                  onBlur={(e) => saveDevNote(doc, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.currentTarget.blur();
                                  }}
                                  placeholder="Ej: cheque ya entregado…"
                                  className="h-8 w-56 rounded-md border border-line px-2 text-xs"
                                />
                                {savedId === key && (
                                  <span className="text-xs font-medium text-success">✓</span>
                                )}
                              </div>
                            </td>
                          );
                        }
                        // Otros ingresos: botón para marcar como recaudo
                        if (tab.id === "otrosIngresos" && c.key === "accion") {
                          return (
                            <td key={c.key} className="whitespace-nowrap border-b border-line px-3.5 py-2.5 text-center text-sm">
                              <button
                                onClick={() => setRecaudo(sig, true)}
                                disabled={rowBusy}
                                className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-primary transition hover:border-primary hover:bg-primary-light/40 disabled:opacity-50"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Marcar recaudo
                              </button>
                            </td>
                          );
                        }
                        // Recaudo: acción = borrar (solo las marcadas a mano)
                        if (tab.id === "recaudoPendiente" && c.key === "accion") {
                          return (
                            <td key={c.key} className="whitespace-nowrap border-b border-line px-3.5 py-2.5 text-center text-sm">
                              {row.manual ? (
                                <button
                                  onClick={() => setRecaudo(sig, false)}
                                  disabled={rowBusy}
                                  className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-error transition hover:bg-error/5 disabled:opacity-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Borrar
                                </button>
                              ) : (
                                <span className="text-xs text-ink-soft">auto</span>
                              )}
                            </td>
                          );
                        }
                        return <Cell key={c.key} col={c} value={row[c.key]} />;
                      })}
                    </tr>
                  );
                })}
              </tbody>
              {tab.total && (
                <tfoot>
                  <tr className="border-t-2 border-line bg-surface font-bold">
                    {tab.cols.map((c, idx) => {
                      if (c.num) {
                        // Total de la columna sobre las filas mostradas (respeta filtros).
                        const sum = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
                        return (
                          <td
                            key={c.key}
                            className={`whitespace-nowrap border-b border-line px-3.5 py-2.5 text-center text-sm tabular-nums ${signClass(sum)}`}
                          >
                            {money(sum)}
                          </td>
                        );
                      }
                      return (
                        <td key={c.key} className="whitespace-nowrap border-b border-line px-3.5 py-2.5 text-center text-sm text-ink-soft">
                          {idx === 0 ? "Total" : ""}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ col, value }: { col: Col; value: unknown }) {
  // Tablas de detalle: TODO centrado (encabezados y datos).
  const base = "whitespace-nowrap border-b border-line px-3.5 py-2.5 text-center text-sm";
  if (col.num) {
    // Negativos en rojo, positivos en verde; la diferencia ≠ 0 además en negrita.
    const bold = col.key === "diferencia" && Number(value) !== 0 ? "font-bold" : "";
    return (
      <td className={`${base} tabular-nums ${signClass(value)} ${bold}`}>
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
  if (col.key === "pago") {
    const parcial = String(value) === "Pago parcial";
    return (
      <td className={base}>
        <span
          className={`rounded-md px-2 py-1 text-xs font-bold ${
            parcial ? "bg-warning/20 text-warning" : "bg-success/15 text-success"
          }`}
        >
          {String(value ?? "OK")}
        </span>
      </td>
    );
  }
  if (col.key === "status") {
    const v = String(value ?? "");
    const cls =
      v === "Ok"
        ? "bg-success/15 text-success"
        : v === "Cheque devuelto"
          ? "bg-error/10 text-error"
          : "bg-warning/20 text-warning";
    return (
      <td className={base}>
        <span className={`rounded-md px-2 py-1 text-xs font-bold ${cls}`}>{v}</span>
      </td>
    );
  }
  return <td className={base}>{value == null ? "" : fmtDate(value)}</td>;
}
