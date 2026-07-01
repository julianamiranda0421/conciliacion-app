// Cierre de conciliación: los saldos del mes por cuenta.
//
// Modelo:
//  - Saldo inicial: lo digita el usuario (saldo con el que abre el mes).
//  - Total ingresos: Σ movimientos positivos del extracto (automático).
//  - Total egresos:  Σ |movimientos negativos| del extracto (automático).
//  - Saldo actual:   saldo inicial + ingresos − egresos (calculado).
//
// El mes se "aprueba" (cierra) cuando el usuario confirma. Lógica pura y sin
// dependencias: se reutiliza en el cliente (tarjetas en vivo) y en el servidor.

export type ClosingTotals = {
  ingresos: number; // Σ movimientos positivos
  egresos: number; // Σ |movimientos negativos|
};

// Suma ingresos (positivos) y egresos (|negativos|) de los movimientos del extracto.
export function computeMovTotals(movs: { valor: number }[]): ClosingTotals {
  let ingresos = 0;
  let egresos = 0;
  for (const m of movs) {
    const v = Number(m.valor) || 0;
    if (v > 0) ingresos += v;
    else if (v < 0) egresos += -v;
  }
  return { ingresos, egresos };
}

// Saldo actual = saldo inicial + ingresos − egresos. El saldo inicial vacío se
// trata como 0 para poder mostrar el cálculo antes de que se digite.
export function saldoActual(
  saldoInicial: number | null,
  totals: ClosingTotals,
): number {
  return (saldoInicial ?? 0) + totals.ingresos - totals.egresos;
}
