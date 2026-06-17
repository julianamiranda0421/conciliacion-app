"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { TcResult, TcDetalle } from "@/lib/reconcileTC";
// money (alias cop): mismo formato que el Conciliado físico, negativos con "-$".
import { fmtDate, signClass, money as cop } from "@/lib/format";

export function TarjetaCreditoPanel({
  result,
  period,
  accountId,
  observaciones,
}: {
  result: TcResult;
  period: string;
  accountId: string;
  observaciones: Record<string, string>;
}) {
  const r = result.resumen;

  const [tab, setTab] = useState<"conc" | "pend" | "mov">("conc");
  const [fFactura, setFFactura] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>(observaciones);
  // Drawer lateral con el detalle factura por factura del pago seleccionado.
  const [drawer, setDrawer] = useState<TcDetalle | null>(null);

  async function saveNote(transactionId: number, texto: string) {
    if (!transactionId) return;
    await fetch("/api/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period, accountId, transactionId, texto }),
    }).catch(() => {});
  }

  // Recaudo conciliado = adquirencias que cruzaron a factura; pendientes = sin factura.
  const conciliadas = useMemo(
    () =>
      result.detalle.filter(
        (d) => d.link && (!fFactura || d.link.facturas.join(",").includes(fFactura.trim())),
      ),
    [result.detalle, fFactura],
  );
  const nConciliadas = useMemo(() => result.detalle.filter((d) => d.link).length, [result.detalle]);
  const pendientes = useMemo(() => result.detalle.filter((d) => !d.link), [result.detalle]);
  const movimientos = result.movimientos;

  // Tarjetas KPI, mismo estilo que recaudo físico. Lógica (ejemplo 10/2/12/6/6/50%):
  // Ingreso Bancario (Nc, neto) + Adquirencias (comisión) = Ingreso neto (bruto).
  // Pendiente = Ingreso neto − Valor conciliado; Recaudo% = Valor conciliado / Ingreso neto.
  const ingresoBancario = r.bancoNCTotal;
  const adquirencias = r.totalComision;
  const ingresoNeto = ingresoBancario + adquirencias;
  const valorConciliado = r.consumoEnlazado;
  const pendiente = ingresoNeto - valorConciliado;
  const pctRecaudo = ingresoNeto > 0 ? Math.round((valorConciliado / ingresoNeto) * 100) : 0;

  const valClass = (cls: string) =>
    cls === "ok" ? "text-success" : cls === "bad" ? "text-error" : cls === "warn" ? "text-warning" : cls === "primary" ? "text-primary" : "";
  const kpis: { cls: string; lbl: string; val: string; sub?: string; bar?: number }[] = [
    { cls: "primary", lbl: "Ingreso Bancario", val: cop(ingresoBancario), sub: "Nc del banco por TC (sin comisión)" },
    { cls: "primary", lbl: "Adquirencias", val: cop(adquirencias), sub: "comisiones del adquirente" },
    { cls: "ok", lbl: "Ingreso neto", val: cop(ingresoNeto), sub: "Ingreso Bancario + Adquirencias" },
    { cls: "ok", lbl: "Valor conciliado", val: cop(valorConciliado), sub: `${r.nEnlazadas} de ${r.nAdq} adquirencias cruzadas` },
    { cls: Math.abs(pendiente) > 1 ? "bad" : "ok", lbl: "Pendiente de conciliar", val: cop(pendiente), sub: "Ingreso neto − Valor conciliado" },
    { cls: "ok", lbl: "Recaudo", val: `${pctRecaudo}%`, sub: "Valor conciliado / Ingreso neto", bar: pctRecaudo },
  ];

  const TABS = [
    { id: "conc" as const, label: "Recaudo Conciliado", n: nConciliadas },
    { id: "pend" as const, label: "Partidas Conciliatorias Pendientes", n: pendientes.length },
    { id: "mov" as const, label: "Movimientos Bancarios", n: movimientos.length },
  ];

  const th = "whitespace-nowrap border-b border-line bg-surface px-3 py-2.5 text-center text-[11px] uppercase tracking-wide text-ink-soft";
  const td = "whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-sm";
  const tdNum = `${td} tabular-nums`;

  const sumPendConsumo = pendientes.reduce((s, d) => s + d.consumo, 0);
  const sumPendComision = pendientes.reduce((s, d) => s + d.comisionTotal, 0);
  const sumPendNeto = pendientes.reduce((s, d) => s + d.neto, 0);
  const sumMov = movimientos.reduce((s, m) => s + m.valor, 0);

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
                <div className="h-full bg-success" style={{ width: `${c.bar}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pestañas (mismas que las otras cuentas) */}
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

      {/* === Recaudo Conciliado === */}
      {tab === "conc" && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              value={fFactura}
              onChange={(e) => setFFactura(e.target.value)}
              placeholder="Buscar factura…"
              className="h-10 w-44 rounded-md border border-line bg-white px-3 text-sm"
            />
            <span className="ml-auto text-sm text-ink-soft">{conciliadas.length} filas</span>
          </div>
          {conciliadas.length === 0 ? (
            <div className="mt-4 rounded-xl border border-line bg-surface px-6 py-12 text-center text-sm text-ink-soft">
              Sin recaudo conciliado en TC.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["TransacciónID", "Factura", "Período factura", "Valor factura", "Bia créditos", "Valor consumo", "Adquirencias", "Total Ingreso", "Fecha abono", "Status factura", "Pago", "Observaciones"].map((h) => (
                        <th key={h} className={`${th} ${h === "Factura" ? "min-w-[160px]" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {conciliadas.map((d, i) => {
                      const txnId = d.link!.transactionId;
                      const statusOk = d.link!.statusFactura === "SUCCESS";
                      return (
                        <tr key={i} className="hover:bg-primary-light/40">
                          <td className={tdNum}>{txnId}</td>
                          <td className="min-w-[160px] border-b border-line px-3 py-2.5 text-center text-sm">
                            <button
                              onClick={() => setDrawer(d)}
                              className="font-medium text-primary underline-offset-2 hover:underline"
                              title="Ver detalle por factura"
                            >
                              {d.link!.facturas.join(", ")}
                            </button>
                          </td>
                          <td className={td}>{d.link!.periodo}</td>
                          <td className={`${tdNum} ${signClass(d.valorFactura)}`}>{cop(d.valorFactura)}</td>
                          <td className={`${tdNum} ${signClass(d.link!.biaCreditos)}`}>{cop(d.link!.biaCreditos)}</td>
                          <td className={`${tdNum} ${signClass(d.consumo)}`}>{cop(d.consumo)}</td>
                          <td className={`${tdNum} ${signClass(d.comisionTotal)}`}>{cop(d.comisionTotal)}</td>
                          <td className={`${tdNum} ${signClass(d.neto)}`}>{cop(d.neto)}</td>
                          <td className={td}>{fmtDate(d.fechaAbono)}</td>
                          <td className={td}>
                            <span className={`rounded-md px-2 py-1 text-xs font-bold ${statusOk ? "bg-success/15 text-success" : "bg-warning/20 text-warning"}`}>{d.link!.statusFactura}</span>
                          </td>
                          <td className={td}>
                            <span className={`rounded-md px-2 py-1 text-xs font-bold ${d.link!.esParcial ? "bg-warning/20 text-warning" : "bg-success/15 text-success"}`}>{d.link!.esParcial ? "Pago parcial" : "OK"}</span>
                          </td>
                          <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-center text-sm">
                            <input
                              value={notes[String(txnId)] ?? ""}
                              onChange={(e) => setNotes((n) => ({ ...n, [String(txnId)]: e.target.value }))}
                              onBlur={(e) => saveNote(txnId, e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                              placeholder="—"
                              className="h-8 w-52 rounded-md border border-line px-2 text-xs"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* === Partidas Conciliatorias Pendientes (adquirencias sin factura) === */}
      {tab === "pend" && (
        <>
          <div className="mt-4 flex items-center">
            <span className="ml-auto text-sm text-ink-soft">{pendientes.length} filas</span>
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
                    <tr>
                      {["Fecha vale", "Fecha abono", "Red", "Tipo tarjeta", "Tarjeta", "Valor consumo", "Adquirencias", "Total Ingreso"].map((h) => (
                        <th key={h} className={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pendientes.map((d, i) => (
                      <tr key={i} className="hover:bg-primary-light/40">
                        <td className={td}>{fmtDate(d.fechaVale)}</td>
                        <td className={td}>{fmtDate(d.fechaAbono)}</td>
                        <td className={td}>{d.red}</td>
                        <td className={td}>{d.tipoTarjeta}</td>
                        <td className={td}>{d.tarjeta}</td>
                        <td className={`${tdNum} ${signClass(d.consumo)}`}>{cop(d.consumo)}</td>
                        <td className={`${tdNum} ${signClass(d.comisionTotal)}`}>{cop(d.comisionTotal)}</td>
                        <td className={`${tdNum} ${signClass(d.neto)}`}>{cop(d.neto)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line bg-surface font-bold">
                      <td className={`${td} text-ink-soft`} colSpan={5}>Total</td>
                      <td className={`${tdNum} ${signClass(sumPendConsumo)}`}>{cop(sumPendConsumo)}</td>
                      <td className={`${tdNum} ${signClass(sumPendComision)}`}>{cop(sumPendComision)}</td>
                      <td className={`${tdNum} ${signClass(sumPendNeto)}`}>{cop(sumPendNeto)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* === Movimientos Bancarios (Nc del TC) === */}
      {tab === "mov" && (
        <>
          <div className="mt-4 flex items-center">
            <span className="ml-auto text-sm text-ink-soft">{movimientos.length} filas</span>
          </div>
          {movimientos.length === 0 ? (
            <div className="mt-2 rounded-xl border border-line bg-surface px-6 py-12 text-center text-sm text-ink-soft">
              Sin movimientos de TC en el extracto.
            </div>
          ) : (
            <div className="mt-2 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>{["Fecha", "Descripción", "Valor"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m, i) => (
                      <tr key={i} className="hover:bg-primary-light/40">
                        <td className={td}>{fmtDate(m.fecha)}</td>
                        <td className={td}>{m.descripcion}</td>
                        <td className={`${tdNum} ${signClass(m.valor)}`}>{cop(m.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line bg-surface font-bold">
                      <td className={`${td} text-ink-soft`} colSpan={2}>Total</td>
                      <td className={`${tdNum} ${signClass(sumMov)}`}>{cop(sumMov)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Cuadre por día: neto de adquirencias vs Nc del banco */}
          <details className="mt-4 rounded-lg border border-line bg-white">
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">
              Cuadre por día (neto adquirencias vs Nc banco) — {r.porDia.filter((d) => Math.abs(d.diff) < 2).length}/{r.porDia.length} días cuadran
            </summary>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {["Fecha abono", "Neto adquirencias", "Nc banco", "Diferencia"].map((h) => (
                      <th key={h} className="border-b border-line bg-surface px-4 py-2 text-center text-[11px] uppercase tracking-wide text-ink-soft">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.porDia.map((d) => (
                    <tr key={d.fecha} className={Math.abs(d.diff) >= 2 ? "bg-error/5" : ""}>
                      <td className="border-b border-line px-4 py-2 text-center">{fmtDate(d.fecha)}</td>
                      <td className={`border-b border-line px-4 py-2 text-center tabular-nums ${signClass(d.netoAdq)}`}>{cop(d.netoAdq)}</td>
                      <td className={`border-b border-line px-4 py-2 text-center tabular-nums ${signClass(d.bancoNC)}`}>{cop(d.bancoNC)}</td>
                      <td className={`border-b border-line px-4 py-2 text-center tabular-nums ${Math.abs(d.diff) >= 2 ? "text-error font-medium" : "text-ink-soft"}`}>{cop(d.diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}

      {drawer?.link && <FacturasDrawer detalle={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}

// Panel lateral (mitad de pantalla, a la derecha) con el detalle factura por factura
// del pago TC seleccionado: período, valor de la factura y valor aplicado, + total.
function FacturasDrawer({ detalle, onClose }: { detalle: TcDetalle; onClose: () => void }) {
  const link = detalle.link!;
  const filas = link.detalleFacturas;
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
        {/* Encabezado */}
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <h3 className="text-base font-bold">Detalle del pago por factura</h3>
            <p className="mt-0.5 text-xs text-ink-soft">
              Pago recibido (consumo) <b>{cop(detalle.consumo)}</b> · {filas.length} factura(s)
              {link.transactionId ? ` · TransacciónID ${link.transactionId}` : ""}
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

        {/* Tabla de facturas */}
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

          {/* Subtotales: Valor aplicado (efectivo) + Bia créditos = Valor facturas (Total). */}
          <div className="mt-4 rounded-lg border border-line bg-surface/50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-soft">Valor facturas</span>
              <span className="tabular-nums">{cop(sumFactura)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-ink-soft">Valor aplicado</span>
              <span className="tabular-nums">{cop(sumAplicado)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-ink-soft">Bia créditos</span>
              <span className="tabular-nums">{cop(link.biaCreditos)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{cop(sumAplicado + link.biaCreditos)}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
