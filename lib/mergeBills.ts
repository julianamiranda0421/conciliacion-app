// Fusión "el extracto no reemplaza, hereda": toma los movimientos recién leídos del
// estado de cuenta (que NO traen factura) y les asigna la factura conocida por
// fecha+valor, usando el mapa persistido de cargas con factura (los CORTE).
//
// El emparejamiento es 1 a 1: si hay dos movimientos con la misma fecha+valor, cada
// uno toma una factura distinta del cupo. Puro y sin dependencias (testeable).

import type { BankMovement } from "./parseBank";
import type { BillPair } from "./db";

// Clave estable por fecha + valor (en centavos, para evitar problemas de coma flotante).
function key(fecha: string, valor: number): string {
  return `${fecha}|${Math.round(valor * 100)}`;
}

export function attachBills(movs: BankMovement[], pairs: BillPair[]): BankMovement[] {
  // Cupo de facturas por fecha+valor (solo las que traen factura).
  const buckets = new Map<string, string[]>();
  for (const p of pairs) {
    if (!p.billId) continue;
    const k = key(p.fecha, p.valor);
    const arr = buckets.get(k) ?? [];
    arr.push(p.billId);
    buckets.set(k, arr);
  }

  return movs.map((m) => {
    if (m.billId) return m; // ya trae factura: se respeta
    const arr = buckets.get(key(m.fecha, m.valor));
    const billId = arr && arr.length ? arr.shift()! : "";
    return billId ? { ...m, billId, ref1: billId } : m;
  });
}
