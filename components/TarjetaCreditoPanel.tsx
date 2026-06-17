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
  const cuadra = Math.abs(r.diffNetoVsBanco) < 100;

  const [fFactura, setFFactura] = useState("");
  const [fEstado, setFEstado] = useState("");
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

  const filas = useMemo(() => {
    return result.detalle.filter((d) => {
      if (fFactura && !(d.link?.facturas.join(",").includes(fFactura.trim()))) return false;
      if (fEstado) {
        const estado = !d.link ? "Sin cruce" : d.link.esParcial ? "Parcial" : "Total";
        if (estado !== fEstado) return false;
      }
      return true;
    });
  }, [result.detalle, fFactura, fEstado]);

  const cards = [
    { label: "Facturas por TC (consumo)", value: cop(r.totalConsumo), sub: `${r.nAdq} cargos · ${r.nEnlazadas} cruzados a factura` },
    { label: "Comisión total", value: cop(r.totalComision), sub: "consumo − neto (lo que descuenta el banco)" },
    { label: "Neto (ingreso al banco)", value: cop(r.totalNeto), sub: "lo que realmente ingresó por TC" },
    {
      label: "NC banco vs neto",
      value: cop(r.bancoNCTotal),
      sub: cuadra ? "✓ cuadra con adquirencias" : `dif ${cop(r.diffNetoVsBanco)}`,
      bad: !cuadra,
    },
  ];

  return (
    <div>
      <p className="text-sm text-ink-soft">
        El cliente paga la factura completa (consumo); el banco descuenta comisiones y abona el neto
        (las &quot;Nc …&quot; del extracto). La diferencia es la comisión, no un descuadre.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-line bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-ink-soft">{c.label}</div>
            <div className={`mt-1 text-xl font-bold tabular-nums ${c.bad ? "text-error" : ""}`}>{c.value}</div>
            <div className="mt-1 text-xs text-ink-soft">{c.sub}</div>
          </div>
        ))}
      </div>

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

      {/* Filtros */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input
          value={fFactura}
          onChange={(e) => setFFactura(e.target.value)}
          placeholder="Buscar factura…"
          className="h-9 w-44 rounded-md border border-line bg-white px-3 text-sm"
        />
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="h-9 rounded-md border border-line bg-white px-3 text-sm">
          <option value="">Todo pago</option>
          <option value="Total">Total</option>
          <option value="Parcial">Parcial</option>
          <option value="Sin cruce">Sin cruce</option>
        </select>
        <span className="text-sm text-ink-soft">{filas.length} de {result.detalle.length}</span>
      </div>

      {/* Detalle por cargo TC — misma visual que el Conciliado físico + adquirencias */}
      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {[
                  "TransacciónID", "Factura", "Período factura",
                  "Valor factura", "Bia créditos", "Valor consumo", "Adquirencias", "Total Ingreso",
                  "Fecha abono", "Status factura", "Pago", "Observaciones",
                ].map((h) => (
                  <th key={h} className={`whitespace-nowrap border-b border-line bg-surface px-3.5 py-2.5 text-center text-[11px] uppercase tracking-wide text-ink-soft ${h === "Factura" ? "min-w-[160px]" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((d, i) => {
                const cruzada = !!d.link;
                const txnId = d.link?.transactionId ?? 0;
                const base = "whitespace-nowrap border-b border-line px-3.5 py-2.5 text-center text-sm";
                const numCls = `${base} tabular-nums`;
                const statusOk = d.link?.statusFactura === "SUCCESS";
                return (
                  <tr key={i} className="hover:bg-primary-light/40">
                    <td className={`${base} tabular-nums`}>{d.link?.transactionId ?? "—"}</td>
                    <td className="min-w-[160px] border-b border-line px-3.5 py-2.5 text-center text-sm">
                      {d.link ? (
                        <button
                          onClick={() => setDrawer(d)}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                          title="Ver detalle por factura"
                        >
                          {d.link.facturas.join(", ")}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={base}>{d.link?.periodo ?? "—"}</td>
                    <td className={`${numCls} ${signClass(d.valorFactura)}`}>{cop(d.valorFactura)}</td>
                    <td className={`${numCls} ${signClass(d.link?.biaCreditos)}`}>{d.link ? cop(d.link.biaCreditos) : "—"}</td>
                    <td className={`${numCls} ${signClass(d.consumo)}`}>{cop(d.consumo)}</td>
                    <td className={`${numCls} ${signClass(d.comisionTotal)}`}>{cop(d.comisionTotal)}</td>
                    <td className={`${numCls} ${signClass(d.neto)}`}>{cop(d.neto)}</td>
                    <td className={base}>{fmtDate(d.fechaAbono)}</td>
                    <td className={base}>
                      {cruzada ? (
                        <span className={`rounded-md px-2 py-1 text-xs font-bold ${statusOk ? "bg-success/15 text-success" : "bg-warning/20 text-warning"}`}>
                          {d.link!.statusFactura}
                        </span>
                      ) : "—"}
                    </td>
                    <td className={base}>{cruzada ? (d.link!.esParcial ? "Parcial" : "Total") : "—"}</td>
                    <td className="whitespace-nowrap border-b border-line px-3.5 py-2.5 text-center text-sm">
                      {txnId ? (
                        <input
                          value={notes[String(txnId)] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [String(txnId)]: e.target.value }))}
                          onBlur={(e) => saveNote(txnId, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                          placeholder="—"
                          className="h-8 w-52 rounded-md border border-line px-2 text-xs"
                        />
                      ) : (
                        <span className="text-xs text-ink-soft">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

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
