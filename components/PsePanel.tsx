"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { PseResult, PseConciliado } from "@/lib/reconcilePse";
// money (alias cop): mismo formato que el Conciliado físico, negativos con "-$".
import { fmtDate, signClass, money as cop } from "@/lib/format";

// Tolerancia de cuadre: el amount de bills_360 trae decimales → diferencia de
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
  observaciones: Record<string, string>; // clave "pse:<cus>" (conciliado y pendientes)
}) {
  const r = result.resumen;

  const [tab, setTab] = useState<"conc" | "pend" | "mov" | "gw">("conc");
  const [fFactura, setFFactura] = useState("");
  const [soloDif, setSoloDif] = useState(false); // filtrar solo cruces con diferencia
  const [bancoFil, setBancoFil] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>(observaciones);
  const [drawer, setDrawer] = useState<PseConciliado | null>(null);

  // Observación (conciliado o pendiente) persistida por CUS — clave estable que NO
  // cambia al re-sincronizar bills_360 (a diferencia de transaction_id/id). Usa
  // dev_observations con documento="pse:<cus>" vía /api/observations.
  async function saveNote(cus: string, texto: string) {
    if (!cus) return;
    await fetch("/api/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period, accountId, documento: `pse:${cus}`, texto }),
    }).catch(() => {});
  }

  const conciliadas = useMemo(
    () =>
      result.conciliado.filter(
        (c) =>
          (!fFactura || c.facturas.join(",").includes(fFactura.trim()) || c.cus.includes(fFactura.trim())) &&
          (!soloDif || Math.round(c.diferencia) !== 0),
      ),
    [result.conciliado, fFactura, soloDif],
  );
  const pendientes = result.pendientes;
  const movimientos = result.movimientos;

  const bancos = useMemo(
    () => [...new Set(result.gateway.map((g) => g.bancoOriginador).filter(Boolean))].sort(),
    [result.gateway],
  );
  const gatewayFiltrado = useMemo(
    () => result.gateway.filter((g) => !bancoFil || g.bancoOriginador === bancoFil),
    [result.gateway, bancoFil],
  );

  const valClass = (cls: string) =>
    cls === "ok" ? "text-success" : cls === "bad" ? "text-error" : cls === "warn" ? "text-warning" : cls === "primary" ? "text-primary" : "";
  const diffOk = Math.abs(r.diffAchVsBanco) <= TOL;
  const kpis: { cls: string; lbl: string; val: string; sub?: string; bar?: number }[] = [
    { cls: "primary", lbl: "Archivo ACH (mes)", val: cop(r.achMes), sub: r.achOtroCiclo ? `+ ${cop(r.achOtroCiclo)} de otro ciclo` : "recaudo PSE del operador" },
    { cls: "primary", lbl: "Ingreso 7772 (banco)", val: cop(r.bancoTotal), sub: `${movimientos.length} depósitos "Recaudos Compras Pse"` },
    { cls: diffOk ? "ok" : "bad", lbl: "Diferencia ACH vs 7772", val: cop(r.diffAchVsBanco), sub: diffOk ? "cuadra ✓" : "revisar (ciclo/timing)" },
    { cls: "ok", lbl: "Conciliado a factura", val: cop(r.valorConciliado), sub: `${r.nConciliado} tx (${r.nManual} manual) · ${r.nFacturas} facturas` },
    { cls: r.nPendiente > 0 ? "warn" : "ok", lbl: "Partidas conciliatorias", val: cop(r.valorPendiente), sub: `${r.nPendiente} partida(s) (sin pago / fuera de corte)` },
    { cls: "ok", lbl: "Conciliado", val: `${r.pctConciliado}%`, sub: "Conciliado a factura / Archivo ACH", bar: r.pctConciliado },
  ];

  const TABS = [
    { id: "conc" as const, label: "Recaudo Conciliado", n: conciliadas.length },
    { id: "pend" as const, label: "Partidas Conciliatorias Pendientes", n: pendientes.length },
    { id: "mov" as const, label: "Movimientos Bancarios", n: movimientos.length },
    { id: "gw" as const, label: "Detalle gateway (archivo ACH)", n: result.gateway.length },
  ];

  const th = "whitespace-nowrap border-b border-line bg-surface px-3 py-2.5 text-center text-[11px] uppercase tracking-wide text-ink-soft";
  const td = "whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-sm";
  const tdNum = `${td} tabular-nums`;

  const sumMov = movimientos.reduce((s, m) => s + m.valor, 0);
  const sumConcAch = conciliadas.reduce((s, c) => s + c.valorAch, 0);
  const sumConcFact = conciliadas.reduce((s, c) => s + c.valorFactura, 0);
  const sumConcBia = conciliadas.reduce((s, c) => s + c.biaCreditos, 0);
  const sumConcPlat = conciliadas.reduce((s, c) => s + c.ingresoPlataforma, 0);
  const sumPend = pendientes.reduce((s, p) => s + p.valor, 0);
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

      {/* === Recaudo Conciliado (transacciones ACH enlazadas por CUS a factura) === */}
      {tab === "conc" && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              value={fFactura}
              onChange={(e) => setFFactura(e.target.value)}
              placeholder="Buscar factura o CUS…"
              className="h-10 w-52 rounded-md border border-line bg-white px-3 text-sm"
            />
            <select
              value={soloDif ? "dif" : ""}
              onChange={(e) => setSoloDif(e.target.value === "dif")}
              className="h-10 rounded-md border border-line bg-white px-3 text-sm"
            >
              <option value="">Diferencia: Todas</option>
              <option value="dif">Solo con diferencia</option>
            </select>
            <span className="ml-auto text-sm text-ink-soft">{conciliadas.length} filas · {cop(sumConcAch)}</span>
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
                      {["CUS", "Factura", "Período", "Valor ACH", "Ingreso plataforma", "Diferencia", "Valor factura", "Bia créditos", "Banco originador", "Fecha", "Status factura", "Pago", "Observaciones"].map((h) => (
                        <th key={h} className={`${th} ${h === "Factura" ? "min-w-[160px]" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {conciliadas.map((c, i) => {
                      const statusOk = c.statusFactura === "SUCCESS";
                      return (
                        <tr key={i} className={`hover:bg-primary-light/40 ${c.otroCiclo ? "bg-warning/5" : ""}`}>
                          <td className={td}>
                            {c.cus}
                            {c.otroCiclo && <span className="ml-1 rounded bg-warning/20 px-1 text-[10px] font-bold text-warning" title="Fecha de otro ciclo (arrastre/tránsito)">ciclo</span>}
                          </td>
                          <td className="min-w-[160px] border-b border-line px-3 py-2.5 text-center text-sm">
                            <button
                              onClick={() => setDrawer(c)}
                              className="font-medium text-primary underline-offset-2 hover:underline"
                              title="Ver detalle por factura"
                            >
                              {c.facturas.join(", ")}
                            </button>
                          </td>
                          <td className={td}>
                            <span className="mx-auto block max-w-[88px] truncate" title={c.periodo}>{c.periodo}</span>
                          </td>
                          <td className={`${tdNum} ${signClass(c.valorAch)}`}>{cop(c.valorAch)}</td>
                          <td className={`${tdNum} ${signClass(c.ingresoPlataforma)}`}>{cop(c.ingresoPlataforma)}</td>
                          <td className={`${tdNum} ${c.diferencia !== 0 ? "font-bold text-error" : "text-ink-soft"}`}>{cop(c.diferencia)}</td>
                          <td className={`${tdNum} ${signClass(c.valorFactura)}`}>{cop(c.valorFactura)}</td>
                          <td className={`${tdNum} ${signClass(c.biaCreditos)}`}>{cop(c.biaCreditos)}</td>
                          <td className={td}>{c.bancoOriginador}</td>
                          <td className={td}>{fmtDate(c.fechaAch)}</td>
                          <td className={td}>
                            <span className={`rounded-md px-2 py-1 text-xs font-bold ${statusOk ? "bg-success/15 text-success" : "bg-warning/20 text-warning"}`}>{c.statusFactura}</span>
                          </td>
                          <td className={td}>
                            {Math.round(c.diferencia) !== 0 ? (
                              <span className="rounded-md bg-error/15 px-2 py-1 text-xs font-bold text-error" title="El cruce tiene diferencia — revisar/validar y anotar la observación">Validar</span>
                            ) : (
                              <span className={`rounded-md px-2 py-1 text-xs font-bold ${c.esParcial ? "bg-warning/20 text-warning" : "bg-success/15 text-success"}`}>{c.esParcial ? "Pago parcial" : "OK"}</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-sm">
                            <input
                              value={notes[`pse:${c.cus}`] ?? ""}
                              onChange={(e) => setNotes((n) => ({ ...n, [`pse:${c.cus}`]: e.target.value }))}
                              onBlur={(e) => saveNote(c.cus, e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                              placeholder="—"
                              className="h-8 w-44 rounded-md border border-line px-2 text-xs"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line bg-surface font-bold">
                      <td className={`${td} text-ink-soft`} colSpan={3}>Total</td>
                      <td className={`${tdNum} ${signClass(sumConcAch)}`}>{cop(sumConcAch)}</td>
                      <td className={`${tdNum} ${signClass(sumConcPlat)}`}>{cop(sumConcPlat)}</td>
                      <td className={td}></td>
                      <td className={`${tdNum} ${signClass(sumConcFact)}`}>{cop(sumConcFact)}</td>
                      <td className={`${tdNum} ${signClass(sumConcBia)}`}>{cop(sumConcBia)}</td>
                      <td className={td} colSpan={5}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* === Partidas Pendientes (transacciones ACH SIN pago en plataforma) === */}
      {tab === "pend" && (
        <>
          <p className="mt-4 text-xs text-ink-soft">
            Transacciones reportadas por el operador PSE en el archivo ACH que no tienen un pago
            identificado en la plataforma (ni por CUS ni por grupo s3 de pago manual). Revisar:
            pueden ser de otro ciclo o sin aplicar.
          </p>
          <div className="mt-2 flex items-center">
            <span className="ml-auto text-sm text-ink-soft">{pendientes.length} filas · {cop(sumPend)}</span>
          </div>
          {pendientes.length === 0 ? (
            <div className="mt-2 rounded-xl border border-line bg-surface px-6 py-12 text-center text-sm text-ink-soft">
              Sin partidas pendientes ✓
            </div>
          ) : (
            <div className="mt-2 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>{["CUS", "Valor", "Fecha", "Banco originador", "Pagador (NIT/CC)", "Ciclo", "Observaciones"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {pendientes.map((p, i) => (
                      <tr key={i} className={`hover:bg-primary-light/40 ${p.fueraCorte ? "bg-primary-light/30" : p.otroCiclo ? "bg-warning/5" : ""}`}>
                        <td className={td}>{p.fueraCorte ? "—" : p.cus}</td>
                        <td className={`${tdNum} ${signClass(p.valor)}`}>{cop(p.valor)}</td>
                        <td className={td}>{p.fueraCorte ? "—" : fmtDate(p.fecha)}</td>
                        <td className={td}>{p.bancoOriginador || "—"}</td>
                        <td className={td}>{p.pagador}</td>
                        <td className={td}>
                          {p.fueraCorte
                            ? <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">Fuera de corte</span>
                            : p.otroCiclo
                              ? <span className="rounded-md bg-warning/20 px-2 py-1 text-xs font-bold text-warning">Otro ciclo</span>
                              : <span className="rounded-md bg-error/15 px-2 py-1 text-xs font-bold text-error">Sin pago</span>}
                        </td>
                        <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-sm">
                          <input
                            value={notes[`pse:${p.cus}`] ?? ""}
                            onChange={(e) => setNotes((n) => ({ ...n, [`pse:${p.cus}`]: e.target.value }))}
                            onBlur={(e) => saveNote(p.cus, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                            placeholder="Anota la partida…"
                            className="h-8 w-60 rounded-md border border-line px-2 text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line bg-surface font-bold">
                      <td className={`${td} text-ink-soft`}>Total</td>
                      <td className={`${tdNum} ${signClass(sumPend)}`}>{cop(sumPend)}</td>
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

          {/* Cuadre por día: archivo ACH (por fecha) vs depósito banco. El banco abona
              con rezago de ciclo, así que el diario no coincide; el total del mes sí. */}
          <details className="mt-4 rounded-lg border border-line bg-white">
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">
              Cuadre por día (archivo ACH vs depósito banco)
            </summary>
            <p className="px-4 pb-2 text-xs text-ink-soft">
              El banco abona el PSE por ciclo (con rezago), por eso el diario no coincide exacto.
              Mes: archivo ACH {cop(r.achMes)} vs banco {cop(r.bancoTotal)} → diferencia {cop(r.diffAchVsBanco)}.
            </p>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {["Fecha", "Archivo ACH", "Depósito banco", "Diferencia"].map((h) => (
                      <th key={h} className="border-b border-line bg-surface px-4 py-2 text-center text-[11px] uppercase tracking-wide text-ink-soft">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.porDia.map((d) => (
                    <tr key={d.fecha}>
                      <td className="border-b border-line px-4 py-2 text-center">{fmtDate(d.fecha)}</td>
                      <td className={`border-b border-line px-4 py-2 text-center tabular-nums ${signClass(d.ach)}`}>{cop(d.ach)}</td>
                      <td className={`border-b border-line px-4 py-2 text-center tabular-nums ${signClass(d.banco)}`}>{cop(d.banco)}</td>
                      <td className="border-b border-line px-4 py-2 text-center tabular-nums text-ink-soft">{cop(d.diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}

      {/* === Detalle gateway (archivo ACH completo) === */}
      {tab === "gw" && (
        <>
          <p className="mt-4 text-xs text-ink-soft">
            Archivo Transacciones ACH (reporte del operador PSE) de {period}: {result.gateway.length} transacciones.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              value={bancoFil}
              onChange={(e) => setBancoFil(e.target.value)}
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
              Sin transacciones para este filtro.
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
              CUS <b>{conciliado.cus}</b> · ingreso al banco <b>{cop(conciliado.ingresoPlataforma)}</b> · {filas.length} factura(s)
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
                        {/* Pago por factura = según la diferencia REAL de ESTA factura (no el
                            flag is_partial_payment del pago, que viene true para todas las
                            filas del lote). dif 0 = este pago la cubrió completa. */}
                        <span className={`rounded-md px-2 py-1 text-xs font-bold ${dif !== 0 ? "bg-warning/20 text-warning" : "bg-success/15 text-success"}`}>{dif !== 0 ? "Pago parcial" : "OK"}</span>
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
              <span className="text-ink-soft">Valor ACH (operador)</span>
              <span className="tabular-nums">{cop(conciliado.valorAch)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-ink-soft">Ingreso plataforma (amount)</span>
              <span className="tabular-nums">{cop(conciliado.ingresoPlataforma)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-ink-soft">Bia créditos</span>
              <span className="tabular-nums">{cop(conciliado.biaCreditos)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2 font-semibold">
              <span>Valor facturas</span>
              <span className="tabular-nums">{cop(sumFactura)}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
