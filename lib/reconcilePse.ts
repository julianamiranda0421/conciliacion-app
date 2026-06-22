// Conciliación del canal PSE del 7772.
//
// Modelo (decisión usuaria 2026-06-22): el archivo "Transacciones ACH" (reporte del
// operador PSE) es la AUTORIDAD del recaudo. El cruce central es:
//
//   ARCHIVO ACH (total del mes)  ==  INGRESO 7772 (depósitos "Recaudos Compras Pse")
//
// Como es ACH, hay transacciones de fin de mes que aplican en el ciclo del mes
// SIGUIENTE (y entran del mes anterior), así que el total del archivo del mes y los
// depósitos del banco deben cuadrar separando ese "otro ciclo". Verificado mayo: el
// archivo SIN las transacciones del 30-abr ($909.7M) = $27.711.013.185 = banco exacto.
//
// Cada transacción del archivo se enriquece por su **CUS** (llave fuerte = el CUS de
// `payment_bills`/bills_360) con la(s) factura(s) que pagó. Las que no tienen pago en
// la plataforma quedan como partidas conciliatorias pendientes (para investigar).

import type { BankMovement } from "./parseBank";
import type { PseRow } from "./parsePse";

// Pago PSE de bills_360 (una fila por factura; amount/biaCredits son por transacción).
export type PseTxn = {
  transactionId: number;
  billId: string;
  amount: number;
  biaCredits: number;
  total: number;
  paymentDate: string;
  period: string | null;
  billStatus: string | null;
  methodName: string;
  isPartial: boolean;
  cus: string; // llave de cruce contra el archivo Transacciones ACH
};

export type PseFacturaDetalle = {
  billId: string;
  periodo: string;
  valorFactura: number;
  valorAplicado: number; // efectivo del pago repartido proporcional (sin bia)
  statusFactura: string;
  esParcial: boolean;
};

// Transacción del archivo ACH conciliada (enlazada por CUS a su pago/factura).
export type PseConciliado = {
  cus: string;
  valorAch: number; // valor del archivo (autoridad)
  fechaAch: string;
  bancoOriginador: string;
  pagador: string; // NIT/CC (Referencia 1)
  otroCiclo: boolean; // fecha del archivo cae en otro mes (arrastre/tránsito)
  // Lado plataforma (por CUS):
  transactionId: number;
  facturas: string[];
  periodo: string;
  valorFactura: number; // Σ total de facturas
  ingresoPlataforma: number; // amount de la transacción (lo que entra al banco)
  biaCreditos: number;
  statusFactura: string;
  esParcial: boolean;
  diferencia: number; // valorAch − ingresoPlataforma (debería ~0)
  detalleFacturas: PseFacturaDetalle[];
};

// Transacción del archivo ACH SIN pago en la plataforma (partida conciliatoria).
export type PsePendiente = {
  cus: string;
  valor: number;
  fecha: string;
  bancoOriginador: string;
  pagador: string;
  estado: string;
  otroCiclo: boolean;
};

export type PseResumen = {
  achTotal: number; // archivo ACH (aprobadas), todas las fechas
  achMes: number; // archivo ACH del mes del período
  achOtroCiclo: number; // archivo ACH de otro mes (arrastre/tránsito)
  bancoTotal: number; // depósitos "Recaudos Compras Pse" del 7772
  diffAchVsBanco: number; // achMes − bancoTotal (debería ~0)
  nConciliado: number;
  valorConciliado: number; // Σ valorAch de las conciliadas
  nPendiente: number;
  valorPendiente: number; // Σ valor de las pendientes
  nFacturas: number;
  pctConciliado: number; // valorConciliado / achTotal
  porDia: { fecha: string; ach: number; banco: number; diff: number }[];
};

export type PseMovimiento = { fecha: string; descripcion: string; valor: number; documento: string };

export type PseResult = {
  conciliado: PseConciliado[];
  pendientes: PsePendiente[];
  movimientos: PseMovimiento[];
  resumen: PseResumen;
  gateway: PseRow[];
};

const r2 = (n: number) => Math.round(n);

const MESES_ES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

// "Mayo 2026" -> { mes: 5, anio: 2026 }
function periodMes(period: string): { mes: number; anio: number } | null {
  const m = period.trim().toLowerCase().match(/([a-záéíóú]+)\s+(\d{4})/);
  if (!m) return null;
  const mes = MESES_ES[m[1]];
  const anio = Number(m[2]);
  return mes && anio ? { mes, anio } : null;
}

// ¿El movimiento del banco es un recaudo PSE? (descripción "Recaudos Compras Pse").
export function esRecaudoPse(m: BankMovement): boolean {
  return m.valor > 0 && /recaudos?\s+compras?\s+pse/i.test(m.descripcion.trim());
}

export function reconcilePse(
  pseFile: PseRow[],
  pseTxns: PseTxn[],
  banco: BankMovement[],
  period: string,
): PseResult {
  const pm = periodMes(period);

  // Índice de pagos de plataforma por CUS (agrupados por transacción).
  type Txn = { transactionId: number; amount: number; biaCredits: number; paymentDate: string; isPartial: boolean; bills: PseTxn[] };
  const byCus = new Map<string, Txn>();
  for (const r of pseTxns) {
    const cus = String(r.cus ?? "").trim();
    if (!cus) continue;
    let t = byCus.get(cus);
    if (!t) {
      t = { transactionId: r.transactionId, amount: r2(r.amount), biaCredits: r.biaCredits, paymentDate: r.paymentDate, isPartial: r.isPartial, bills: [] };
      byCus.set(cus, t);
    }
    t.bills.push(r);
  }

  const aprobadas = pseFile.filter((r) => /aprob/i.test(r.estado));
  const esOtroCiclo = (fecha: string): boolean => {
    if (!pm || !fecha) return false;
    const m = fecha.match(/^(\d{4})-(\d{2})/);
    if (!m) return false;
    return !(Number(m[1]) === pm.anio && Number(m[2]) === pm.mes);
  };

  const conciliado: PseConciliado[] = [];
  const pendientes: PsePendiente[] = [];

  for (const a of aprobadas) {
    const cus = String(a.cus ?? "").trim();
    const t = cus ? byCus.get(cus) : undefined;
    const otroCiclo = esOtroCiclo(a.fecha);
    if (!t) {
      pendientes.push({
        cus,
        valor: a.valor,
        fecha: a.fecha,
        bancoOriginador: a.bancoOriginador,
        pagador: a.pagador,
        estado: a.estado,
        otroCiclo,
      });
      continue;
    }
    const periodos = [...new Set(t.bills.map((b) => b.period).filter(Boolean))] as string[];
    const statuses = [...new Set(t.bills.map((b) => b.billStatus).filter(Boolean))] as string[];
    const valorFactura = t.bills.reduce((s, b) => s + b.total, 0);
    const sumTot = valorFactura || 1;
    let restoCash = t.amount;
    const detalleFacturas: PseFacturaDetalle[] = t.bills.map((b, i, arr) => {
      const aplicado = i === arr.length - 1 ? restoCash : Math.round((t.amount * b.total) / sumTot);
      restoCash -= aplicado;
      return {
        billId: b.billId,
        periodo: b.period ?? "—",
        valorFactura: b.total,
        valorAplicado: aplicado,
        statusFactura: b.billStatus ?? "SUCCESS",
        esParcial: b.isPartial,
      };
    });
    conciliado.push({
      cus,
      valorAch: a.valor,
      fechaAch: a.fecha,
      bancoOriginador: a.bancoOriginador,
      pagador: a.pagador,
      otroCiclo,
      transactionId: t.transactionId,
      facturas: t.bills.map((b) => b.billId),
      periodo: periodos[0] ?? "—",
      valorFactura,
      ingresoPlataforma: t.amount,
      biaCreditos: t.biaCredits,
      statusFactura: statuses.length === 1 ? statuses[0] : statuses.join(", ") || "SUCCESS",
      esParcial: t.isPartial,
      diferencia: a.valor - t.amount,
      detalleFacturas,
    });
  }

  conciliado.sort((a, b) => (b.fechaAch || "").localeCompare(a.fechaAch || "") || b.valorAch - a.valorAch);
  pendientes.sort((a, b) => b.valor - a.valor);

  // Banco: depósitos "Recaudos Compras Pse".
  const pseMov = banco.filter(esRecaudoPse);
  const bancoTotal = pseMov.reduce((s, m) => s + m.valor, 0);

  const achTotal = aprobadas.reduce((s, r) => s + r.valor, 0);
  const achOtroCiclo = aprobadas.filter((r) => esOtroCiclo(r.fecha)).reduce((s, r) => s + r.valor, 0);
  const achMes = achTotal - achOtroCiclo;

  const valorConciliado = conciliado.reduce((s, c) => s + c.valorAch, 0);
  const valorPendiente = pendientes.reduce((s, p) => s + p.valor, 0);
  const nFacturas = conciliado.reduce((s, c) => s + c.facturas.length, 0);

  // Cuadre por día: archivo ACH (por fecha) vs depósito banco (por fecha).
  const achDia = new Map<string, number>();
  for (const a of aprobadas) achDia.set(a.fecha, (achDia.get(a.fecha) ?? 0) + a.valor);
  const bancoDia = new Map<string, number>();
  for (const m of pseMov) bancoDia.set(m.fecha, (bancoDia.get(m.fecha) ?? 0) + m.valor);
  const dias = [...new Set([...achDia.keys(), ...bancoDia.keys()])].filter(Boolean).sort();
  const porDia = dias.map((fecha) => {
    const ach = achDia.get(fecha) ?? 0;
    const banco = bancoDia.get(fecha) ?? 0;
    return { fecha, ach, banco, diff: banco - ach };
  });

  return {
    conciliado,
    pendientes,
    movimientos: pseMov.map((m) => ({ fecha: m.fecha, descripcion: m.descripcion, valor: m.valor, documento: m.documento })),
    resumen: {
      achTotal,
      achMes,
      achOtroCiclo,
      bancoTotal,
      diffAchVsBanco: achMes - bancoTotal,
      nConciliado: conciliado.length,
      valorConciliado,
      nPendiente: pendientes.length,
      valorPendiente,
      nFacturas,
      pctConciliado: achTotal > 0 ? Math.round((valorConciliado / achTotal) * 100) : 0,
      porDia,
    },
    gateway: pseFile,
  };
}
