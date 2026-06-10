// Resumen consolidado de la cuenta 7772 (varios canales en un mismo extracto).
// Clasifica los INGRESOS (positivos) por canal y devuelve el extracto completo.

import type { BankMovement } from "./parseBank";

export type CanalResumen = { key: string; label: string; valor: number; n: number };
export type MovResumen = { fecha: string; descripcion: string; valor: number; tran: string; recaudo: string };
export type Resumen7772 = {
  totalIngreso: number;
  canales: CanalResumen[];
  movimientos: MovResumen[];
  nMovimientos: number;
};

const FISICO = ["Deposito Efectivo en Oficina", "Ajuste pago BIA ENERGY REC FACTURAS"];

function canalDe(descripcion: string): "fisico" | "tc" | "pse" | "otros" {
  const d = descripcion.trim();
  if (FISICO.some((c) => d.startsWith(c))) return "fisico";
  if (/^nc\b/i.test(d)) return "tc";
  if (/recaudos?\s+compras?\s+pse/i.test(d)) return "pse";
  return "otros";
}

// Etiqueta de la columna "Recaudo": agrupa los 3 canales; lo demás conserva su concepto.
export function recaudoLabel(descripcion: string): string {
  switch (canalDe(descripcion)) {
    case "fisico": return "FÍSICO";
    case "tc": return "TC";
    case "pse": return "PSE";
    default: return descripcion.trim();
  }
}

export function resumen7772(banco: BankMovement[]): Resumen7772 {
  const acc: Record<string, { valor: number; n: number }> = {
    fisico: { valor: 0, n: 0 },
    tc: { valor: 0, n: 0 },
    pse: { valor: 0, n: 0 },
    otros: { valor: 0, n: 0 },
  };
  let totalIngreso = 0;
  for (const m of banco) {
    if (m.valor <= 0) continue; // solo ingresos
    totalIngreso += m.valor;
    const c = canalDe(m.descripcion);
    acc[c].valor += m.valor;
    acc[c].n += 1;
  }

  const canales: CanalResumen[] = [
    { key: "fisico", label: "Físico / cheque", ...acc.fisico },
    { key: "tc", label: "Tarjeta de crédito", ...acc.tc },
    { key: "pse", label: "PSE", ...acc.pse },
    { key: "otros", label: "Otros ingresos", ...acc.otros },
  ];

  const movimientos: MovResumen[] = banco.map((m) => ({
    fecha: m.fecha,
    descripcion: m.descripcion,
    valor: m.valor,
    tran: m.valor < 0 ? "Nota Débito" : "Nota Crédito",
    recaudo: recaudoLabel(m.descripcion),
  }));

  return { totalIngreso, canales, movimientos, nMovimientos: banco.length };
}
