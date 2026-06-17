"use client";

import { useMemo, useState } from "react";
import type { TcResult } from "@/lib/reconcileTC";
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
                  <th key={h} className="border-b border-line bg-surface px-4 py-2 text-left text-[11px] uppercase tracking-wide text-ink-soft">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.porDia.map((d) => (
                <tr key={d.fecha} className={Math.abs(d.diff) >= 2 ? "bg-error/5" : ""}>
                  <td className="border-b border-line px-4 py-2">{fmtDate(d.fecha)}</td>
                  <td className={`border-b border-line px-4 py-2 text-right tabular-nums ${signClass(d.netoAdq)}`}>{cop(d.netoAdq)}</td>
                  <td className={`border-b border-line px-4 py-2 text-right tabular-nums ${signClass(d.bancoNC)}`}>{cop(d.bancoNC)}</td>
                  <td className={`border-b border-line px-4 py-2 text-right tabular-nums ${Math.abs(d.diff) >= 2 ? "text-error font-medium" : "text-ink-soft"}`}>{cop(d.diff)}</td>
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
                  <th key={h} className={`whitespace-nowrap border-b border-line bg-surface px-3.5 py-2.5 text-left text-[11px] uppercase tracking-wide text-ink-soft ${h === "Factura" ? "min-w-[160px]" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((d, i) => {
                const cruzada = !!d.link;
                const txnId = d.link?.transactionId ?? 0;
                const base = "whitespace-nowrap border-b border-line px-3.5 py-2.5 text-sm";
                const numCls = `${base} text-right tabular-nums`;
                const statusOk = d.link?.statusFactura === "SUCCESS";
                return (
                  <tr key={i} className="hover:bg-primary-light/40">
                    <td className={`${base} tabular-nums`}>{d.link?.transactionId ?? "—"}</td>
                    <td className="min-w-[160px] border-b border-line px-3.5 py-2.5 text-sm">{d.link ? d.link.facturas.join(", ") : "—"}</td>
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
                    <td className="whitespace-nowrap border-b border-line px-3.5 py-2.5 text-sm">
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
    </div>
  );
}
