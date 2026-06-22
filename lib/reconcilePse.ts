// Conciliación del canal PSE del 7772.
//
// Modelo (decisión usuaria 2026-06-22): el RECAUDO CONCILIADO son los pagos PSE
// registrados en la plataforma (bills_360, método BANK_ACCOUNT / "PSE ..."), que
// YA traen su factura (bill_id, período, total, bia créditos). El total de esos
// pagos cuadra contra los depósitos "Recaudos Compras Pse" del extracto del 7772
// (el banco los abona en LOTE por día, igual que las "Nc" de tarjeta de crédito).
//
// El archivo PSE ("Transacciones ACH" del gateway) es una capa de VALIDACIÓN: su
// total (sin el arrastre del mes anterior) cuadra exacto con el banco. Se conserva
// como detalle del gateway (pagador, banco originador) y para el cuadre por día.

import type { BankMovement } from "./parseBank";
import type { PseRow } from "./parsePse";

// Pago PSE candidato (de bills_360), una fila por factura pagada por la
// transacción. amount/biaCredits son por TRANSACCIÓN (se repiten por factura);
// total es por factura.
export type PseTxn = {
  transactionId: number;
  billId: string;
  amount: number; // ingreso bancario del pago (= depósito que llega al banco)
  biaCredits: number; // por transacción
  total: number; // valor de ESTA factura (bills_360.total)
  paymentDate: string; // YYYY-MM-DD
  period: string | null;
  billStatus: string | null;
  methodName: string; // "PSE BANCOLOMBIA" / ...
  isPartial: boolean;
};

// Detalle por factura del pago (para el drawer). Σ valorFactura = amount + bia.
export type PseFacturaDetalle = {
  billId: string;
  periodo: string;
  valorFactura: number; // bills_360.total
  valorAplicado: number; // efectivo del pago repartido proporcional (sin bia)
  statusFactura: string;
  esParcial: boolean;
};

// Un pago PSE conciliado (agrupado por transacción): cubre 1+ facturas.
export type PseConciliado = {
  transactionId: number;
  facturas: string[];
  periodo: string;
  valorFactura: number; // Σ total de las facturas (= amount + bia)
  ingresoBanco: number; // amount de la transacción
  biaCreditos: number;
  metodo: string;
  statusFactura: string;
  esParcial: boolean;
  paymentDate: string;
  detalleFacturas: PseFacturaDetalle[];
};

export type PseResumen = {
  nTxn: number; // transacciones PSE conciliadas (bills_360)
  nFacturas: number; // facturas cubiertas
  totalConciliado: number; // Σ amount (dedup txn)
  ingresoBanco: number; // Σ depósitos "Recaudos Compras Pse" del extracto
  pendiente: number; // ingresoBanco − totalConciliado
  pctRecaudo: number; // totalConciliado / ingresoBanco
  // Gateway (archivo PSE)
  gatewayTxn: number; // # transacciones del archivo PSE
  gatewayTotal: number; // Σ valor del archivo PSE (aprobadas)
  // Cuadre por día: PSE de plataforma (bills_360) vs depósito del banco.
  porDia: { fecha: string; plataforma: number; banco: number; diff: number }[];
};

export type PseMovimiento = { fecha: string; descripcion: string; valor: number; documento: string };

export type PseResult = {
  conciliado: PseConciliado[];
  movimientos: PseMovimiento[];
  resumen: PseResumen;
  gateway: PseRow[]; // archivo PSE (detalle del gateway)
};

const r2 = (n: number) => Math.round(n);

// ¿El movimiento del banco es un recaudo PSE? (descripción "Recaudos Compras Pse").
export function esRecaudoPse(m: BankMovement): boolean {
  return m.valor > 0 && /recaudos?\s+compras?\s+pse/i.test(m.descripcion.trim());
}

export function reconcilePse(
  pseTxns: PseTxn[],
  banco: BankMovement[],
  pseFile: PseRow[],
): PseResult {
  // Agrupar las filas por transacción (amount/biaCredits se repiten por factura).
  type Txn = {
    transactionId: number;
    amount: number;
    biaCredits: number;
    paymentDate: string;
    methodName: string;
    isPartial: boolean;
    bills: PseTxn[];
  };
  const txnMap = new Map<number, Txn>();
  for (const r of pseTxns) {
    let t = txnMap.get(r.transactionId);
    if (!t) {
      t = {
        transactionId: r.transactionId,
        amount: r2(r.amount),
        biaCredits: r.biaCredits,
        paymentDate: r.paymentDate,
        methodName: r.methodName,
        isPartial: r.isPartial,
        bills: [],
      };
      txnMap.set(r.transactionId, t);
    }
    t.bills.push(r);
  }

  const conciliado: PseConciliado[] = [...txnMap.values()].map((t) => {
    const periodos = [...new Set(t.bills.map((b) => b.period).filter(Boolean))] as string[];
    const statuses = [...new Set(t.bills.map((b) => b.billStatus).filter(Boolean))] as string[];
    const valorFactura = t.bills.reduce((s, b) => s + b.total, 0);
    // valorAplicado por factura = efectivo del pago (amount) repartido proporcional
    // al valor de cada factura; NO incluye bia créditos (igual que TC).
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
    return {
      transactionId: t.transactionId,
      facturas: t.bills.map((b) => b.billId),
      periodo: periodos[0] ?? "—",
      valorFactura,
      ingresoBanco: t.amount,
      biaCreditos: t.biaCredits,
      metodo: t.methodName,
      statusFactura: statuses.length === 1 ? statuses[0] : statuses.join(", ") || "SUCCESS",
      esParcial: t.isPartial,
      paymentDate: t.paymentDate,
      detalleFacturas,
    };
  });
  // Orden: más reciente primero, monto desc como desempate.
  conciliado.sort((a, b) => (b.paymentDate || "").localeCompare(a.paymentDate || "") || b.ingresoBanco - a.ingresoBanco);

  // Banco: depósitos "Recaudos Compras Pse".
  const pseMov = banco.filter(esRecaudoPse);
  const ingresoBanco = pseMov.reduce((s, m) => s + m.valor, 0);
  const totalConciliado = conciliado.reduce((s, c) => s + c.ingresoBanco, 0);
  const nFacturas = conciliado.reduce((s, c) => s + c.facturas.length, 0);

  // Cuadre por día: PSE de plataforma (por payment_date) vs depósito banco (por fecha).
  const platDia = new Map<string, number>();
  for (const c of conciliado) platDia.set(c.paymentDate, (platDia.get(c.paymentDate) ?? 0) + c.ingresoBanco);
  const bancoDia = new Map<string, number>();
  for (const m of pseMov) bancoDia.set(m.fecha, (bancoDia.get(m.fecha) ?? 0) + m.valor);
  const dias = [...new Set([...platDia.keys(), ...bancoDia.keys()])].filter(Boolean).sort();
  const porDia = dias.map((fecha) => {
    const plataforma = platDia.get(fecha) ?? 0;
    const banco = bancoDia.get(fecha) ?? 0;
    return { fecha, plataforma, banco, diff: banco - plataforma };
  });

  const aprobadas = pseFile.filter((r) => /aprob/i.test(r.estado));
  const gatewayTotal = aprobadas.reduce((s, r) => s + r.valor, 0);

  return {
    conciliado,
    movimientos: pseMov.map((m) => ({
      fecha: m.fecha,
      descripcion: m.descripcion,
      valor: m.valor,
      documento: m.documento,
    })),
    resumen: {
      nTxn: conciliado.length,
      nFacturas,
      totalConciliado,
      ingresoBanco,
      pendiente: ingresoBanco - totalConciliado,
      pctRecaudo: ingresoBanco > 0 ? Math.round((totalConciliado / ingresoBanco) * 100) : 0,
      gatewayTxn: aprobadas.length,
      gatewayTotal,
      porDia,
    },
    gateway: pseFile,
  };
}
