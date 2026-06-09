// Comparación ingreso al banco vs aplicado en facturas: dos barras totales.

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const W = 520;
const H = 260;
const PAD = { top: 28, bottom: 36, left: 16, right: 16 };
const innerH = H - PAD.top - PAD.bottom;
const BAR_W = 120;

export function IngresoVsAplicado({
  ingresoBanco,
  aplicado,
}: {
  ingresoBanco: number;
  aplicado: number;
}) {
  if (ingresoBanco === 0 && aplicado === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-ink-soft">
        No hay caja conciliada para este mes de extracto.
      </div>
    );
  }

  const max = Math.max(ingresoBanco, aplicado) || 1;
  const h = (v: number) => (v / max) * innerH;
  const yTop = (v: number) => PAD.top + (innerH - h(v));
  const baseline = PAD.top + innerH;

  // dos barras centradas
  const gap = 80;
  const totalW = BAR_W * 2 + gap;
  const x0 = (W - totalW) / 2;
  const bars = [
    { label: "Ingreso al banco", value: ingresoBanco, x: x0, cls: "fill-primary" },
    { label: "Aplicado en facturas", value: aplicado, x: x0 + BAR_W + gap, cls: "fill-success" },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Ingreso al banco vs aplicado en facturas">
      <line x1={PAD.left} x2={W - PAD.right} y1={baseline} y2={baseline} stroke="currentColor" className="text-line" strokeWidth={1} />
      {bars.map((b) => (
        <g key={b.label}>
          <rect x={b.x} y={yTop(b.value)} width={BAR_W} height={h(b.value)} rx={6} className={b.cls} />
          <text x={b.x + BAR_W / 2} y={yTop(b.value) - 8} textAnchor="middle" className="fill-ink text-[12px] font-semibold">
            {cop.format(b.value)}
          </text>
          <text x={b.x + BAR_W / 2} y={baseline + 20} textAnchor="middle" className="fill-ink-soft text-[11px]">
            {b.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
