// Curva de recaudo acumulado (SVG propio, sin librería de gráficos).
// Eje X = fecha de pago; eje Y = % acumulado del recaudo del período.

type Point = { date: string; pct: number };

const W = 760;
const H = 300;
const PAD = { top: 16, right: 24, bottom: 32, left: 48 };
const innerW = W - PAD.left - PAD.right;
const innerH = H - PAD.top - PAD.bottom;

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

export function RecaudoCurve({ points }: { points: Point[] }) {
  if (points.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-ink-soft">
        No hay recaudo registrado en este período.
      </div>
    );
  }

  const t0 = new Date(points[0].date + "T00:00:00").getTime();
  const t1 = new Date(points[points.length - 1].date + "T00:00:00").getTime();
  const span = t1 - t0 || 1;

  const x = (iso: string) =>
    PAD.left + ((new Date(iso + "T00:00:00").getTime() - t0) / span) * innerW;
  const y = (pct: number) => PAD.top + innerH - (pct / 100) * innerH;

  const linePts = points.map((p) => `${x(p.date).toFixed(1)},${y(p.pct).toFixed(1)}`);
  const areaPath =
    `M ${x(points[0].date).toFixed(1)},${(PAD.top + innerH).toFixed(1)} ` +
    `L ${linePts.join(" L ")} ` +
    `L ${x(points[points.length - 1].date).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  const gridY = [0, 25, 50, 75, 100];
  // Hasta 4 marcas de fecha en X (inicio, ~33%, ~66%, fin).
  const tickIdx = [...new Set([0, Math.floor((points.length - 1) / 3), Math.floor((2 * (points.length - 1)) / 3), points.length - 1])];
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Curva de recaudo acumulado">
      {/* grilla horizontal + etiquetas % */}
      {gridY.map((g) => (
        <g key={g}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} stroke="currentColor" className="text-line" strokeWidth={1} />
          <text x={PAD.left - 8} y={y(g) + 4} textAnchor="end" className="fill-ink-soft text-[10px]">{g}%</text>
        </g>
      ))}
      {/* área + línea */}
      <path d={areaPath} className="fill-primary/10" />
      <polyline points={linePts.join(" ")} fill="none" className="stroke-primary" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {/* punto final con etiqueta */}
      <circle cx={x(last.date)} cy={y(last.pct)} r={4} className="fill-primary" />
      <text x={x(last.date) - 6} y={y(last.pct) - 8} textAnchor="end" className="fill-ink text-[11px] font-semibold">
        {last.pct.toFixed(1)}%
      </text>
      {/* marcas de fecha */}
      {tickIdx.map((i) => (
        <text key={i} x={x(points[i].date)} y={H - 10} textAnchor="middle" className="fill-ink-soft text-[10px]">
          {fmtDate(points[i].date)}
        </text>
      ))}
    </svg>
  );
}
