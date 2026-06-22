"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { PseResult, PseConciliado } from "@/lib/reconcilePse";
// money (alias cop): mismo formato que el Conciliado físico, negativos con "-$".
import { fmtDate, signClass, money as cop } from "@/lib/format";

// Tolerancia para "cuadra": el amount de bills_360 trae decimales → diferencia de
// redondeo de unos miles sobre miles de millones se considera cuadre.
const TOL = 100_000;

export function PsePanel({
  result,
  period,
  accountId,
  observaciones,
}: {
  result: PseResult;
  period: string;
  accountId: string;
  observaciones: Record<string, string>;
}) {
  const r = result.resumen;

  const [tab, setTab] = useState<"conc" | "mov" | "gw">("conc");
  const [fFactura, setFFactura] = useState("");
  const [banco, setBanco] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>(observaciones);
  const [drawer, setDrawer] = useState<PseConciliado | null>(null);

  async function saveNote(transactionId: number, texto: string) {
    if (!transactionId) return;
    await fetch("/api/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period, accountId, transactionId, texto }),
    }).catch(() => {});
  }

  const conciliadas = useMemo(
    () =>
      result.conciliado.filter(
        (c) => !fFactura || c.facturas.join(",").includes(fFactura.trim()),
      ),
    [result.conciliado, fFactura],
  );
  const movimientos = result.movimientos;

  // Gateway (archivo PSE): filtro por banco originador.
  const bancos = useMemo(
    () => [...new Set(result.gateway.map((g) => g.bancoOriginador).filter(Boolean))].sort(),
    [result.gateway],
  );
  const gatewayFiltrado = useMemo(
    () => result.gateway.filter((g) => !banco || g.bancoOriginador === banco),
    [result.gateway, banco],
  );

  // KPIs estilo recaudo físico (grid lg:grid-cols-3).
  const valClass = (cls: string) =>
    cls === "ok" ? "text-success" : cls === "bad" ? "text-error" : cls === "warn" ? "text-warning" : cls === "primary" ? "text-primary" : "";
  const kpis: { cls: string; lbl: string; val: string; sub?: string; bar?: number }[] = [
    { cls: "primary", lbl: "Ingreso Bancario", val: cop(r.ingresoBanco), sub: `${movimientos.length} depósitos "Recaudos Compras Pse"` },
    { cls: "ok", lbl: "Recaudo conciliado", val: cop(r.totalConciliado), sub: `${r.nTxn} pagos PSE · ${r.nFacturas} facturas` },
    { cls: Math.abs(r.pendiente) > TOL ? "bad" : "ok", lbl: "Pendiente de conciliar", val: cop(r.pendiente), sub: "Ingreso Bancario − Recaudo conciliado" },
    { cls: "primary", lbl: "Facturas conciliadas", val: r.nFacturas.toLocaleString("es-CO"), sub: `${r.nTxn} transacciones` },
    { cls: "primary", lbl: "Gateway (archivo PSE)", val: cop(r.gatewayTotal), sub: `${r.gatewayTxn} tx aprobadas` },
    { cls: "ok", lbl: "Recaudo", val: `${r.pctRecaudo}%`, sub: "Recaudo conciliado / Ingreso Bancario", bar: r.pctRecaudo },
  ];

  const TABS = [
    { id: "conc" as const, label: "Recaudo Conciliado", n: conciliadas.length },
    { id: "mov" as const, label: "Movimientos Bancarios", n: movimientos.length },
    { id: "gw" as const, label: "Detalle gateway (archivo PSE)", n: result.gateway.length },
  ];

  const th = "whitespace-nowrap border-b border-line bg-surface px-3 py-2.5 text-center text-[11px] uppercase tracking-wide text-ink-soft";
  const td = "whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-sm";
  const tdNum = `${td} tabular-nums`;

  const sumMov = movimientos.reduce((s, m) => s + m.valor, 0);
  const sumConcFact = conciliadas.reduce((s, c) => s + c.valorFactura, 0);
  const sumConcBia = conciliadas.reduce((s, c) => s + c.biaCreditos, 0);
  const sumConcBanco = conciliadas.reduce((s, c) => s + c.ingresoBanco, 0);
  const sumGw = gatewayFiltrado.reduce((s, g) => s + g.valor, 0);

  return (
    <div>
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((c) => (
          <div key={c.lbl} className="rounded-xl border border-line bg-white p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{c.lbl}</div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${valClass(c.cls)}`}>{c.val}</div>
            {c.sub && <div className="mt-1 text-xs text-ink-soft">{c.sub}</div>}
            {c.bar != null && (
              <div className="mt-2 h-1 overflow-hidden rounded bg-line">
                <div className="h-full bg-success" style={{ width: `${Math.min(c.bar, 100)}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pestañas */}
      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                active
                  ? "border-primary bg-primary text-white"
                  : "border-line bg-white text-ink-soft hover:border-primary hover:text-primary"
              }`}
            >
              {t.label} <span className="opacity-60">({t.n})</span>
            </button>
          );
        })}
      </div>

      {/* === Recaudo Conciliado (pagos PSE de bills_360 → factura) === */}
      {tab === "conc" && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              value={fFactura}
              onChange={(e) => setFFactura(e.target.value)}
              placeholder="Buscar factura…"
              className="h-10 w-44 rounded-md border border-line bg-white px-3 text-sm"
            />
            <span className="ml-auto text-sm text-ink-soft">{conciliadas.length} filas · {cop(sumConcBanco)}</span>
          </div>
          {conciliadas.length === 0 ? (
            <div className="mt-4 rounded-xl border border-line bg-surface px-6 py-12 text-center text-sm text-ink-soft">
              Sin recaudo PSE conciliado.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["TransacciónID", "Factura", "Período", "Valor factura", "Bia créditos", "Ingreso Bancario", "Método", "Fecha pago", "Status factura", "Pago", "Observaciones"].map((h) => (
                        <th key={h} className={`${th} ${h === "Factura" ? "min-w-[160px]" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {conciliadas.map((c, i) => {
                      const statusOk = c.statusFactura === "SUCCESS";
                      return (
                        <tr key={i} className="hover:bg-primary-light/40">
                          <td className={tdNum}>{c.transactionId}</td>
                          <td className="min-w-[160px] border-b border-line px-3 py-2.5 text-center text-sm">
                            <button
                              onClick={() => setDrawer(c)}
                              className="font-medium text-primary underline-offset-2 hover:underline"
                              title="Ver detalle por factura"
                            >
                              {c.facturas.join(", ")}
                            </button>
                          </td>
                          <td className={td}>{c.periodo}</td>
                          <td className={`${tdNum} ${signClass(c.valorFactura)}`}>{cop(c.valorFactura)}</td>
                          <td className={`${tdNum} ${signClass(c.biaCreditos)}`}>{cop(c.biaCreditos)}</td>
                          <td className={`${tdNum} ${signClass(c.ingresoBanco)}`}>{cop(c.ingresoBanco)}</td>
                          <td className={td}>{c.metodo}</td>
                          <td className={td}>{fmtDate(c.paymentDate)}</td>
                          <td className={td}>
                            <span className={`rounded-md px-2 py-1 text-xs font-bold ${statusOk ? "bg-success/15 text-success" : "bg-warning/20 text-warning"}`}>{c.statusFactura}</span>
                          </td>
                          <td className={td}>
                            <span className={`rounded-md px-2 py-1 text-xs font-bold ${c.esParcial ? "bg-warning/20 text-warning" : "bg-success/15 text-success"}`}>{c.esParcial ? "Pago parcial" : "OK"}</span>
                          </td>
                          <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-sm">
                            <input
                              value={notes[String(c.transactionId)] ?? ""}
                              onChange={(e) => setNotes((n) => ({ ...n, [String(c.transactionId)]: e.target.value }))}
                              onBlur={(e) => saveNote(c.transactionId, e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                              placeholder="—"
                              className="h-8 w-52 rounded-md border border-line px-2 text-xs"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line bg-surface font-bold">
                      <td className={`${td} text-ink-soft`} colSpan={3}>Total</td>
                      <td className={`${tdNum} ${signClass(sumConcFact)}`}>{cop(sumConcFact)}</td>
                      <td className={`${tdNum} ${signClass(sumConcBia)}`}>{cop(sumConcBia)}</td>
                      <td className={`${tdNum} ${signClass(sumConcBanco)}`}>{cop(sumConcBanco)}</td>
                      <td className={td} colSpan={5}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* === Movimientos Bancarios (depósitos "Recaudos Compras Pse") === */}
      {tab === "mov" && (
        <>
          <div className="mt-4 flex items-center">
            <span className="ml-auto text-sm text-ink-soft">{movimientos.length} filas</span>
          </div>
          {movimientos.length === 0 ? (
            <div className="mt-2 rounded-xl border border-line bg-surface px-6 py-12 text-center text-sm text-ink-soft">
              Sin depósitos PSE en el extracto.
            </div>
          ) : (
            <div className="mt-2 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>{["Fecha", "Descripción", "Documento", "Valor"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m, i) => (
                      <tr key={i} className="hover:bg-primary-light/40">
                        <td className={td}>{fmtDate(m.fecha)}</td>
                        <td className={td}>{m.descripcion}</td>
                        <td className={td}>{m.documento}</td>
                        <td className={`${tdNum} ${signClass(m.valor)}`}>{cop(m.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line bg-surface font-bold">
                      <td className={`${td} text-ink-soft`} colSpan={3}>Total</td>
                      <td className={`${tdNum} ${signClass(sumMov)}`}>{cop(sumMov)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Cuadre por día: PSE de plataforma (bills_360) vs depósito del banco.
              El banco abona el PSE con ~1 día de rezago, así que el diario NO coincide
              día a día aunque el total del mes sí cuadre — la diferencia es timing. */}
          <details className="mt-4 rounded-lg border border-line bg-white">
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">
              Cuadre por día (PSE plataforma vs depósito banco)
            </summary>
            <p className="px-4 pb-2 text-xs text-ink-soft">
              El banco abona el PSE con ~1 día de rezago, por eso el diario no coincide exacto;
              el total del mes sí cuadra ({cop(r.totalConciliado)} plataforma vs {cop(r.ingresoBanco)} banco).
            </p>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {["Fecha", "PSE plataforma", "Depósito banco", "Diferencia"].map((h) => (
                      <th key={h} className="border-b border-line bg-surface px-4 py-2 text-center text-[11px] uppercase tracking-wide text-ink-soft">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.porDia.map((d) => (
                    <tr key={d.fecha}>
                      <td className="border-b border-line px-4 py-2 text-center">{fmtDate(d.fecha)}</td>
                      <td className={`border-b border-line px-4 py-2 text-center tabular-nums ${signClass(d.plataforma)}`}>{cop(d.plataforma)}</td>
                      <td className={`border-b border-line px-4 py-2 text-center tabular-nums ${signClass(d.banco)}`}>{cop(d.banco)}</td>
                      <td className={`border-b border-line px-4 py-2 text-center tabular-nums text-ink-soft`}>{cop(d.diff)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line bg-surface font-bold">
                    <td className="px-4 py-2 text-center text-ink-soft">Total</td>
                    <td className={`px-4 py-2 text-center tabular-nums ${signClass(r.totalConciliado)}`}>{cop(r.totalConciliado)}</td>
                    <td className={`px-4 py-2 text-center tabular-nums ${signClass(r.ingresoBanco)}`}>{cop(r.ingresoBanco)}</td>
                    <td className={`px-4 py-2 text-center tabular-nums ${Math.abs(r.pendiente) >= TOL ? "text-error" : "text-ink-soft"}`}>{cop(r.ingresoBanco - r.totalConciliado)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </details>
        </>
      )}

      {/* === Detalle gateway (archivo PSE) === */}
      {tab === "gw" && (
        <>
          <p className="mt-4 text-xs text-ink-soft">
            Detalle del gateway PSE (archivo &quot;Transacciones ACH&quot;) de {period}. Es la capa de
            validación: su total cuadra con los depósitos del banco. No trae número de factura.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
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
            <span className="ml-auto text-sm text-ink-soft">{gatewayFiltrado.length} filas · {cop(sumGw)}</span>
          </div>
          {gatewayFiltrado.length === 0 ? (
            <div className="mt-4 rounded-xl border border-line bg-surface px-6 py-12 text-center text-sm text-ink-soft">
              Sin transacciones PSE para este filtro.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["Fecha", "Hora", "CUS", "Banco originador", "Pagador (NIT/CC)", "Tipo", "Valor", "Estado"].map((h) => (
                        <th key={h} className={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gatewayFiltrado.map((g, i) => (
                      <tr key={`${g.cus}-${i}`} className="hover:bg-primary-light/40">
                        <td className={td}>{fmtDate(g.fecha)}</td>
                        <td className={td}>{g.hora}</td>
                        <td className={td}>{g.cus}</td>
                        <td className={td}>{g.bancoOriginador}</td>
                        <td className={td}>{g.pagador}</td>
                        <td className={td}>{g.tipoUsuario}</td>
                        <td className={`${tdNum} ${signClass(g.valor)}`}>{cop(g.valor)}</td>
                        <td className={td}>{g.estado}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line bg-surface font-bold">
                      <td className={`${td} text-ink-soft`} colSpan={6}>Total</td>
                      <td className={`${tdNum} ${signClass(sumGw)}`}>{cop(sumGw)}</td>
                      <td className={td}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {drawer && <FacturasDrawer conciliado={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}

// Panel lateral con el detalle factura por factura del pago PSE seleccionado.
function FacturasDrawer({ conciliado, onClose }: { conciliado: PseConciliado; onClose: () => void }) {
  const filas = conciliado.detalleFacturas;
  const sumFactura = filas.reduce((s, f) => s + f.valorFactura, 0);
  const sumAplicado = filas.reduce((s, f) => s + f.valorAplicado, 0);
  const sumDiferencia = sumFactura - sumAplicado;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <aside
        className="relative flex h-full w-full flex-col bg-white shadow-2xl sm:w-1/2 sm:min-w-[460px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <h3 className="text-base font-bold">Detalle del pago por factura</h3>
            <p className="mt-0.5 text-xs text-ink-soft">
              Ingreso al banco <b>{cop(conciliado.ingresoBanco)}</b> · {filas.length} factura(s)
              {conciliado.transactionId ? ` · TransacciónID ${conciliado.transactionId}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-ink-soft transition hover:bg-surface hover:text-ink"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Factura", "Período", "Valor factura", "Valor aplicado", "Diferencia", "Status factura", "Pago"].map((h) => (
                    <th key={h} className="whitespace-nowrap border-b border-line bg-surface px-3 py-2.5 text-center text-[11px] uppercase tracking-wide text-ink-soft">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => {
                  const dif = f.valorFactura - f.valorAplicado;
                  const statusOk = f.statusFactura === "SUCCESS";
                  return (
                    <tr key={`${f.billId}-${i}`} className="hover:bg-primary-light/40">
                      <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-sm">{f.billId}</td>
                      <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-sm">{f.periodo}</td>
                      <td className={`whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-sm tabular-nums ${signClass(f.valorFactura)}`}>{cop(f.valorFactura)}</td>
                      <td className={`whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-sm tabular-nums ${signClass(f.valorAplicado)}`}>{cop(f.valorAplicado)}</td>
                      <td className={`whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-sm tabular-nums ${dif !== 0 ? "font-bold text-error" : ""}`}>{cop(dif)}</td>
                      <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-sm">
                        <span className={`rounded-md px-2 py-1 text-xs font-bold ${statusOk ? "bg-success/15 text-success" : "bg-warning/20 text-warning"}`}>{f.statusFactura}</span>
                      </td>
                      <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-sm">
                        <span className={`rounded-md px-2 py-1 text-xs font-bold ${f.esParcial ? "bg-warning/20 text-warning" : "bg-success/15 text-success"}`}>{f.esParcial ? "Pago parcial" : "OK"}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-surface font-bold">
                  <td className="border-b border-line px-3 py-2.5 text-center text-sm text-ink-soft" colSpan={2}>Total</td>
                  <td className={`border-b border-line px-3 py-2.5 text-center text-sm tabular-nums ${signClass(sumFactura)}`}>{cop(sumFactura)}</td>
                  <td className={`border-b border-line px-3 py-2.5 text-center text-sm tabular-nums ${signClass(sumAplicado)}`}>{cop(sumAplicado)}</td>
                  <td className={`border-b border-line px-3 py-2.5 text-center text-sm tabular-nums ${sumDiferencia !== 0 ? "font-bold text-error" : ""}`}>{cop(sumDiferencia)}</td>
                  <td className="border-b border-line px-3 py-2.5" colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-4 rounded-lg border border-line bg-surface/50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-soft">Valor facturas</span>
              <span className="tabular-nums">{cop(sumFactura)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-ink-soft">Valor aplicado (ingreso al banco)</span>
              <span className="tabular-nums">{cop(sumAplicado)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-ink-soft">Bia créditos</span>
              <span className="tabular-nums">{cop(conciliado.biaCreditos)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{cop(sumAplicado + conciliado.biaCreditos)}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
