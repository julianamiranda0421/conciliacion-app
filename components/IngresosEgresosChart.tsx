"use client";

import { useState } from "react";
import { money, moneyShort } from "@/lib/format";

// Gráfico de barras Ingresos vs Egresos con toggle Mes / Semana. SVG/CSS propio
// (sin librerías). Cada punto muestra dos barras: ingresos (verde) y egresos (rojo).
export type SeriesPoint = { label: string; ingresos: number; egresos: number; highlight?: boolean };

export function IngresosEgresosChart({
  monthly,
  weekly,
  defaultMode = "mes",
}: {
  monthly: SeriesPoint[];
  weekly: SeriesPoint[];
  defaultMode?: "mes" | "semana";
}) {
  const [mode, setMode] = useState<"mes" | "semana">(defaultMode);
  const data = mode === "mes" ? monthly : weekly;
  const max = Math.max(1, ...data.map((d) => Math.max(d.ingresos, d.egresos)));

  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">Ingresos vs Egresos</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            {mode === "mes" ? "Comportamiento mes a mes (todas las cuentas)" : "Por semana del mes seleccionado"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Leyenda */}
          <div className="flex items-center gap-3 text-xs text-ink-soft">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-success" /> Ingresos</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-error/70" /> Egresos</span>
          </div>
          {/* Toggle Mes / Semana */}
          <div className="inline-flex rounded-full border border-line p-0.5 text-xs font-medium">
            {(["mes", "semana"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-full px-3 py-1 capitalize transition ${
                  mode === m ? "bg-primary text-white" : "text-ink-soft hover:text-ink"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="mt-6 flex h-56 items-center justify-center rounded-lg border border-dashed border-line text-sm text-ink-soft">
          Aún no hay datos {mode === "mes" ? "de meses" : "de este mes"} para graficar.
        </div>
      ) : (
        <div className="mt-6 flex h-64 items-end gap-3 border-b border-line pb-0">
          {data.map((d, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div className="flex w-full items-end justify-center gap-1" style={{ height: "100%" }}>
                <Bar valor={d.ingresos} max={max} className="bg-success" />
                <Bar valor={d.egresos} max={max} className="bg-error/70" />
              </div>
              <span
                className={`max-w-full truncate text-[11px] ${d.highlight ? "font-bold text-primary" : "text-ink-soft"}`}
                title={d.label}
              >
                {d.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Bar({ valor, max, className }: { valor: number; max: number; className: string }) {
  // Altura mínima visible de 2px cuando hay valor, para no “desaparecer” montos chicos.
  const pct = max > 0 ? (valor / max) * 100 : 0;
  const h = valor > 0 ? `max(2px, ${pct}%)` : "0%";
  return (
    <div
      className={`w-5 rounded-t transition-all ${className}`}
      style={{ height: h }}
      title={`${valor > 0 ? money(valor) : "$0"} (${moneyShort(valor)})`}
    />
  );
}
