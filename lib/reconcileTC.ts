// Conciliación de TARJETA DE CRÉDITO del 7772 (3 capas):
//   FACTURA (plataforma, pago TC = Valor Consumo)
//     → ADQUIRENCIA (consumo − comisiones = neto)
//       → BANCO (las "Nc ..." del extracto = neto, abonado en lote por red/día)
//
// Enlace adquirencia → factura: por Valor Consumo == monto del pago TC, TENIENDO
// EN CUENTA EL MÉTODO (solo transacciones de tarjeta de crédito). Los cargos
// pequeños suelen ser pruebas del equipo tech sobre una factura de prueba: igual
// se enlazan por método+valor. Bia créditos: factura = consumo + bia créditos.

import type { Adquirencia } from "./parseAdquirencias";
import type { BankMovement } from "./parseBank";

// Transacción de tarjeta de crédito (de bills_360), una fila por factura pagada.
export type TcTxn = {
  transactionId: number;
  billId: string;
  amount: number; // monto cargado a la tarjeta (= consumo); por transacción
  biaCredits: number; // por transacción
  paymentDate: string; // YYYY-MM-DD
  period: string | null; // período de la factura
  billStatus: string | null;
};

export type TcLink = {
  transactionId: number;
  facturas: string[];
  periodo: string;
  statusFactura: string;
  biaCreditos: number;
};

export type TcDetalle = {
  fechaVale: string;
  fechaAbono: string;
  red: string;
  tipoTarjeta: string;
  tarjeta: string;
  consumo: number;
  comisionTotal: number;
  neto: number;
  link: TcLink | null;
  valorFactura: number; // consumo + bia créditos (si enlaza)
};

export type TcResumen = {
  nAdq: number;
  nEnlazadas: number;
  totalConsumo: number;
  totalComision: number;
  totalNeto: number;
  bancoNCTotal: number;
  diffNetoVsBanco: number;
  porDia: { fecha: string; netoAdq: number; bancoNC: number; diff: number }[];
};

export type TcResult = { detalle: TcDetalle[]; resumen: TcResumen };

const r2 = (n: number) => Math.round(n);
function dayDist(a: string, b: string): number {
  const da = Date.parse(a), db = Date.parse(b);
  if (isNaN(da) || isNaN(db)) return Number.MAX_SAFE_INTEGER;
  return Math.abs(da - db);
}

// ¿El movimiento del banco es un abono de tarjeta? (descripción empieza por "Nc ").
export function esNotaCreditoTC(m: BankMovement): boolean {
  return m.valor > 0 && /^nc\b/i.test(m.descripcion.trim());
}

export function reconcileTC(
  adquirencias: Adquirencia[],
  banco: BankMovement[],
  tcRows: TcTxn[],
): TcResult {
  // Agrupar las filas TC por transacción (amount/biaCredits se repiten por factura).
  type Txn = { transactionId: number; amount: number; biaCredits: number; paymentDate: string; bills: TcTxn[] };
  const txnMap = new Map<number, Txn>();
  for (const r of tcRows) {
    let t = txnMap.get(r.transactionId);
    if (!t) {
      t = { transactionId: r.transactionId, amount: r2(r.amount), biaCredits: r.biaCredits, paymentDate: r.paymentDate, bills: [] };
      txnMap.set(r.transactionId, t);
    }
    t.bills.push(r);
  }
  // Índice por monto (consumo == amount de la transacción TC).
  const porMonto = new Map<number, Txn[]>();
  for (const t of txnMap.values()) {
    const arr = porMonto.get(t.amount) ?? [];
    arr.push(t);
    porMonto.set(t.amount, arr);
  }

  const usados = new Set<number>();
  // Emparejar primero los consumos grandes (menos ambiguos).
  const orden = [...adquirencias].sort((a, b) => b.consumo - a.consumo);
  const linkByAdq = new Map<Adquirencia, TcLink | null>();
  for (const a of orden) {
    const cands = (porMonto.get(r2(a.consumo)) ?? []).filter((t) => !usados.has(t.transactionId));
    if (!cands.length) { linkByAdq.set(a, null); continue; }
    const ref = a.fechaVale || a.fechaAbono;
    const elegido = cands.sort((x, y) => dayDist(x.paymentDate, ref) - dayDist(y.paymentDate, ref))[0];
    usados.add(elegido.transactionId);
    const periodos = [...new Set(elegido.bills.map((b) => b.period).filter(Boolean))] as string[];
    const statuses = [...new Set(elegido.bills.map((b) => b.billStatus).filter(Boolean))] as string[];
    linkByAdq.set(a, {
      transactionId: elegido.transactionId,
      facturas: elegido.bills.map((b) => b.billId),
      periodo: periodos[0] ?? "—",
      statusFactura: statuses.length === 1 ? statuses[0] : statuses.join(", ") || "SUCCESS",
      biaCreditos: elegido.biaCredits,
    });
  }

  const detalle: TcDetalle[] = adquirencias.map((a) => {
    const link = linkByAdq.get(a) ?? null;
    return {
      fechaVale: a.fechaVale,
      fechaAbono: a.fechaAbono,
      red: a.red,
      tipoTarjeta: a.tipoTarjeta,
      tarjeta: a.tarjeta,
      consumo: a.consumo,
      comisionTotal: a.comisionTotal,
      neto: a.neto,
      link,
      valorFactura: a.consumo + (link?.biaCreditos ?? 0),
    };
  });

  // Banco: notas crédito de tarjeta (Nc ...), agrupadas por día.
  const nc = banco.filter(esNotaCreditoTC);
  const bancoNCTotal = nc.reduce((s, m) => s + m.valor, 0);
  const totalConsumo = adquirencias.reduce((s, a) => s + a.consumo, 0);
  const totalNeto = adquirencias.reduce((s, a) => s + a.neto, 0);
  const totalComision = totalConsumo - totalNeto;

  // Cuadre por día: neto de adquirencias (por Fecha Abono) vs Nc del banco (por fecha).
  const netoDia = new Map<string, number>();
  for (const a of adquirencias) netoDia.set(a.fechaAbono, (netoDia.get(a.fechaAbono) ?? 0) + a.neto);
  const ncDia = new Map<string, number>();
  for (const m of nc) ncDia.set(m.fecha, (ncDia.get(m.fecha) ?? 0) + m.valor);
  const dias = [...new Set([...netoDia.keys(), ...ncDia.keys()])].filter(Boolean).sort();
  const porDia = dias.map((fecha) => {
    const netoAdq = netoDia.get(fecha) ?? 0;
    const bancoNC = ncDia.get(fecha) ?? 0;
    return { fecha, netoAdq, bancoNC, diff: bancoNC - netoAdq };
  });

  return {
    detalle,
    resumen: {
      nAdq: adquirencias.length,
      nEnlazadas: detalle.filter((d) => d.link).length,
      totalConsumo,
      totalComision,
      totalNeto,
      bancoNCTotal,
      diffNetoVsBanco: bancoNCTotal - totalNeto,
      porDia,
    },
  };
}
