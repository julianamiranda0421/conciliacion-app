"use client";

import { useState } from "react";
import { money, moneyShort } from "@/lib/format";

// Gráfico de CURVA Ingresos vs Egresos con toggle Mes / Semana. SVG propio, paleta bia
// (morado = ingresos, azul = egresos; sin rojo/verde).
export type SeriesPoint = { label: string; sub?: string; ingresos: number; egresos: number; highlight?: boolean };

const INGRESOS = "#5B3DF5"; // primary
const EGRESOS = "#0A84FF"; // info

// Lienzo (viewBox); el SVG escala al ancho del contenedor.
const W = 820;
const H = 280;
const PAD = { l: 64, r: 20, t: 20, b: 34 };

type P = { x: number; y: number };

// Curva suave (Catmull-Rom → Bézier cúbica) que pasa por todos los puntos.
function smoothPath(pts: P[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

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
  const [hover, setHover] = useState<number | null>(null);
  const data = mode === "mes" ? monthly : weekly;
  const n = data.length;
  const max = Math.max(1, ...data.map((d) => Math.max(d.ingresos, d.egresos)));

  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const baseY = PAD.t + innerH;
  const x = (i: number) => (n <= 1 ? PAD.l + innerW / 2 : PAD.l + (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.t + innerH - (v / max) * innerH;

  const ingPts: P[] = data.map((d, i) => ({ x: x(i), y: y(d.ingresos) }));
  const egrPts: P[] = data.map((d, i) => ({ x: x(i), y: y(d.egresos) }));
  const ingPath = smoothPath(ingPts);
  const egrPath = smoothPath(egrPts);
  const areaPath = ingPts.length >= 2 ? `${ingPath} L ${ingPts[n - 1].x} ${baseY} L ${ingPts[0].x} ${baseY} Z` : "";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ v: max * t, y: y(max * t) }));

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
          <div className="flex items-center gap-3 text-xs text-ink-soft">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: INGRESOS }} /> Ingresos</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: EGRESOS }} /> Egresos</span>
          </div>
          <div className="inline-flex rounded-full border border-line p-0.5 text-xs font-medium">
            {(["mes", "semana"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setHover(null); }}
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

      {n === 0 ? (
        <div className="mt-6 flex h-56 items-center justify-center rounded-lg border border-dashed border-line text-sm text-ink-soft">
          Aún no hay datos {mode === "mes" ? "de meses" : "de este mes"} para graficar.
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mt-4 h-auto w-full"
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="ingArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={INGRESOS} stopOpacity="0.18" />
              <stop offset="100%" stopColor={INGRESOS} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grilla + etiquetas del eje Y */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={PAD.l} y1={t.y} x2={W - PAD.r} y2={t.y} stroke="#E5E7EB" strokeWidth="1" />
              <text x={PAD.l - 8} y={t.y + 3} textAnchor="end" fontSize="10" fill="#5C5C70">
                {moneyShort(t.v)}
              </text>
            </g>
          ))}

          {/* Área bajo ingresos + curvas */}
          {areaPath && <path d={areaPath} fill="url(#ingArea)" />}
          <path d={egrPath} fill="none" stroke={EGRESOS} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d={ingPath} fill="none" stroke={INGRESOS} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Puntos */}
          {egrPts.map((p, i) => (
            <circle key={`e${i}`} cx={p.x} cy={p.y} r={hover === i ? 5 : 3} fill="white" stroke={EGRESOS} strokeWidth="2" />
          ))}
          {ingPts.map((p, i) => (
            <circle
              key={`i${i}`}
              cx={p.x}
              cy={p.y}
              r={hover === i || data[i].highlight ? 5 : 3.5}
              fill={data[i].highlight || hover === i ? INGRESOS : "white"}
              stroke={INGRESOS}
              strokeWidth="2"
            />
          ))}

          {/* Etiquetas de valor sobre los puntos */}
          {data.map((d, i) => (
            <text key={`vi${i}`} x={ingPts[i].x} y={Math.max(11, ingPts[i].y - 9)} textAnchor="middle" fontSize="9" fontWeight="600" fill={INGRESOS}>
              {moneyShort(d.ingresos)}
            </text>
          ))}
          {data.map((d, i) => (
            <text key={`ve${i}`} x={egrPts[i].x} y={Math.min(baseY - 3, egrPts[i].y + 14)} textAnchor="middle" fontSize="9" fill={EGRESOS}>
              {moneyShort(d.egresos)}
            </text>
          ))}

          {/* Etiquetas del eje X */}
          {data.map((d, i) => (
            <text
              key={`x${i}`}
              x={x(i)}
              y={H - 12}
              textAnchor="middle"
              fontSize="10"
              fontWeight={d.highlight ? 700 : 400}
              fill={d.highlight ? INGRESOS : "#5C5C70"}
            >
              {d.label}
            </text>
          ))}

          {/* Guía vertical + tooltip al pasar el cursor */}
          {hover != null && hover < n && (() => {
            const TW = 200;
            const TH = 60;
            const topY = Math.min(ingPts[hover].y, egrPts[hover].y);
            const tx = Math.max(PAD.l, Math.min(x(hover) - TW / 2, W - PAD.r - TW));
            const ty = Math.max(2, topY - TH - 12);
            const title = data[hover].sub ?? data[hover].label;
            return (
              <g pointerEvents="none">
                <line x1={x(hover)} y1={PAD.t} x2={x(hover)} y2={baseY} stroke="#5C5C70" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
                <rect x={tx} y={ty} width={TW} height={TH} rx="8" fill="white" stroke="#E5E7EB" />
                <text x={tx + 12} y={ty + 18} fontSize="11" fontWeight="700" fill="#1E1E1E">{title}</text>
                <text x={tx + 12} y={ty + 35} fontSize="11" fill={INGRESOS}>{`Ingresos  ${money(data[hover].ingresos)}`}</text>
                <text x={tx + 12} y={ty + 51} fontSize="11" fill={EGRESOS}>{`Egresos  ${money(data[hover].egresos)}`}</text>
              </g>
            );
          })()}

          {/* Bandas invisibles por columna: activan el tooltip al pasar el cursor */}
          {data.map((d, i) => {
            const band = n <= 1 ? innerW : innerW / (n - 1);
            return (
              <rect
                key={`h${i}`}
                x={x(i) - band / 2}
                y={PAD.t}
                width={band}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}
