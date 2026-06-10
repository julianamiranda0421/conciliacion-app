"use client";

import { useMemo, useState } from "react";
import type { TcResult } from "@/lib/reconcileTC";

const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

export function TarjetaCreditoPanel({ result }: { result: TcResult }) {
  const r = result.resumen;
  const cuadra = Math.abs(r.diffNetoVsBanco) < 100;

  const [fFactura, setFFactura] = useState("");
  const [fTarjeta, setFTarjeta] = useState("");
  const [fEstado, setFEstado] = useState("");

  const tiposTarjeta = useMemo(
    () => [...new Set(result.detalle.map((d) => d.tipoTarjeta || d.red).filter(Boolean))].sort(),
    [result.detalle],
  );

  const filas = useMemo(() => {
    return result.detalle.filter((d) => {
      if (fFactura && !(d.link?.facturas.join(",").includes(fFactura.trim()))) return false;
      if (fTarjeta && (d.tipoTarjeta || d.red) !== fTarjeta) return false;
      if (fEstado) {
        const estado = !d.link ? "Sin cruce" : d.link.esParcial ? "Parcial" : "Total";
        if (estado !== fEstado) return false;
      }
      return true;
    });
  }, [result.detalle, fFactura, fTarjeta, fEstado]);

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
                  <td className="border-b border-line px-4 py-2">{d.fecha}</td>
                  <td className="border-b border-line px-4 py-2 text-right tabular-nums">{cop(d.netoAdq)}</td>
                  <td className="border-b border-line px-4 py-2 text-right tabular-nums">{cop(d.bancoNC)}</td>
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
        <select value={fTarjeta} onChange={(e) => setFTarjeta(e.target.value)} className="h-9 rounded-md border border-line bg-white px-3 text-sm">
          <option value="">Toda tarjeta/red</option>
          {tiposTarjeta.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="h-9 rounded-md border border-line bg-white px-3 text-sm">
          <option value="">Todo estado</option>
          <option value="Total">Cruzada · total</option>
          <option value="Parcial">Cruzada · parcial</option>
          <option value="Sin cruce">Sin cruce</option>
        </select>
        <span className="text-sm text-ink-soft">{filas.length} de {result.detalle.length}</span>
      </div>

      {/* Detalle por cargo TC */}
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["TransacciónID", "Fecha abono", "Tarjeta / Red", "Factura(s)", "Período", "Consumo (factura)", "Bia créditos", "Comisión", "Neto", "Pago", "Estado"].map((h) => (
                <th key={h} className="whitespace-nowrap border-b border-line bg-surface px-3 py-2 text-left text-[11px] uppercase tracking-wide text-ink-soft">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((d, i) => {
              const cruzada = !!d.link;
              return (
                <tr key={i} className="hover:bg-primary-light/40">
                  <td className="whitespace-nowrap border-b border-line px-3 py-2 tabular-nums">{d.link?.transactionId ?? "—"}</td>
                  <td className="whitespace-nowrap border-b border-line px-3 py-2">{d.fechaAbono}</td>
                  <td className="whitespace-nowrap border-b border-line px-3 py-2 text-xs text-ink-soft">{d.tipoTarjeta || d.red}</td>
                  <td className="border-b border-line px-3 py-2 text-xs">{d.link ? d.link.facturas.join(", ") : "—"}</td>
                  <td className="whitespace-nowrap border-b border-line px-3 py-2 text-xs">{d.link?.periodo ?? "—"}</td>
                  <td className="border-b border-line px-3 py-2 text-right tabular-nums">{cop(d.consumo)}</td>
                  <td className="border-b border-line px-3 py-2 text-right tabular-nums text-ink-soft">{d.link?.biaCreditos ? cop(d.link.biaCreditos) : "—"}</td>
                  <td className="border-b border-line px-3 py-2 text-right tabular-nums text-warning">{cop(d.comisionTotal)}</td>
                  <td className="border-b border-line px-3 py-2 text-right tabular-nums font-medium">{cop(d.neto)}</td>
                  <td className="whitespace-nowrap border-b border-line px-3 py-2 text-xs">
                    {cruzada ? (d.link!.esParcial ? "Parcial" : "Total") : "—"}
                  </td>
                  <td className="whitespace-nowrap border-b border-line px-3 py-2">
                    {cruzada ? (
                      <span className="rounded bg-success/15 px-2 py-0.5 text-xs font-medium text-success">Cruzada</span>
                    ) : (
                      <span className="rounded bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">Sin cruce</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
