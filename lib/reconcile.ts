// Motor de conciliación 360 — cuenta 8465 Bancolombia.
// Porta la lógica de conciliar.py: cruce con llave principal = Bill ID
// (factura), el valor confirma/desempata, y robustez a referencias recortadas.

import type { BankMovement } from "./parseBank";
import type { Transaction } from "./parseTransactions";

const CONCEPTOS_RECAUDO = [
  "RECAUDO VALIDACION EFECTIVO",
  "RECAUDO VALIDACION CHEQUE",
];

export type Conciliado = {
  transactionId: number;
  billIdTxn: string;
  billIdBanco: string;
  valorBanco: number;
  valorAplicado: number;
  diferencia: number;
  fechaBanco: string;
  fechaPago: string;
  sucursal: string;
  tipo: "EFECTIVO" | "CHEQUE";
  nivelMatch: "ALTO" | "MEDIO";
};

export type BancoSinTxn = {
  fechaBanco: string;
  descripcion: string;
  sucursal: string;
  billId: string;
  documento: string;
  valorBanco: number;
  nota: string;
};

export type TxnSinBanco = {
  transactionId: number;
  billId: string;
  valorAplicado: number;
  fechaPago: string;
  tipo: string;
  nota: string;
};

export type Movimiento = {
  fecha: string;
  descripcion: string;
  sucursal: string;
  valor: number;
};

export type DevAnalisis = {
  fechaDev: string;
  documento: string;
  valor: number;
  facturasAsociadas: string;
  reconsignado: boolean;
  riesgo: string;
};

export type ReconResult = {
  conciliado: Conciliado[];
  bancoSinTxn: BancoSinTxn[];
  txnSinBanco: TxnSinBanco[];
  movimientos: Movimiento[];
  dev: DevAnalisis[];
  resumen: {
    periodo: string;
    nConc: number;
    totalConc: number;
    nBst: number;
    totalBst: number;
    nTsb: number;
    totalTsb: number;
    nDev: number;
    nCritico: number;
    descuadre: number;
  };
};

function billCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.endsWith(b) || b.endsWith(a) || a.includes(b) || b.includes(a);
}

function dayDist(a: string, b: string): number {
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (isNaN(da) || isNaN(db)) return Number.MAX_SAFE_INTEGER;
  return Math.abs(da - db);
}

export function reconcile(
  banco: BankMovement[],
  txns: Transaction[],
  periodo: string,
): ReconResult {
  const recaudos = banco
    .filter((m) => CONCEPTOS_RECAUDO.includes(m.descripcion))
    .map((m, i) => ({ ...m, _i: i, usado: false }));

  const dev = banco.filter((m) => m.descripcion.startsWith("DEV CHEQUE"));

  const conciliado: Conciliado[] = [];
  const txnSinBanco: TxnSinBanco[] = [];

  for (const t of txns) {
    const disponibles = recaudos.filter((r) => !r.usado);
    const porFactura = disponibles.filter((r) => r.billId === t.billId);

    let elegido: (typeof recaudos)[number] | undefined;
    let nivel: "ALTO" | "MEDIO";

    if (porFactura.length) {
      const mismoValor = porFactura.filter((r) => r.valor === t.amount);
      const pool = mismoValor.length ? mismoValor : porFactura;
      elegido = [...pool].sort(
        (a, b) => dayDist(a.fecha, t.paymentDate) - dayDist(b.fecha, t.paymentDate),
      )[0];
      nivel = "ALTO";
    } else {
      const porValor = disponibles.filter((r) => r.valor === t.amount);
      if (!porValor.length) {
        txnSinBanco.push({
          transactionId: t.transactionId,
          billId: t.billId,
          valorAplicado: t.amount,
          fechaPago: t.paymentDate,
          tipo: t.collectionType,
          nota: "Aplicado en transactions, sin recaudo en banco",
        });
        continue;
      }
      const compat = porValor.filter((r) => billCompatible(r.billId, t.billId));
      const pool = compat.length ? compat : porValor;
      elegido = [...pool].sort(
        (a, b) => dayDist(a.fecha, t.paymentDate) - dayDist(b.fecha, t.paymentDate),
      )[0];
      nivel = "MEDIO";
    }

    recaudos[elegido._i].usado = true;
    conciliado.push({
      transactionId: t.transactionId,
      billIdTxn: t.billId,
      billIdBanco: elegido.billId,
      valorBanco: elegido.valor,
      valorAplicado: t.amount,
      diferencia: t.amount - elegido.valor,
      fechaBanco: elegido.fecha,
      fechaPago: t.paymentDate,
      sucursal: elegido.sucursal,
      tipo: elegido.descripcion.includes("CHEQUE") ? "CHEQUE" : "EFECTIVO",
      nivelMatch: nivel,
    });
  }

  // Recaudos del banco sin transaction
  const devValores = new Set(dev.map((d) => -d.valor));
  const bancoSinTxn: BancoSinTxn[] = recaudos
    .filter((r) => !r.usado)
    .map((r) => ({
      fechaBanco: r.fecha,
      descripcion: r.descripcion,
      sucursal: r.sucursal,
      billId: r.billId,
      documento: r.documento,
      valorBanco: r.valor,
      nota: devValores.has(r.valor)
        ? "Recaudo reversado por cheque devuelto (DEV CHEQUE)"
        : "En banco, sin registro en transactions",
    }));

  // Análisis de cheques devueltos
  const devAnalisis: DevAnalisis[] = dev.map((d) => {
    const val = -d.valor;
    const recaudosVal = recaudos.filter((r) => r.valor === val);
    const reconsignado = recaudosVal.some((r) => Date.parse(r.fecha) > Date.parse(d.fecha));
    const bills = txns.filter((t) => t.amount === val).map((t) => t.billId);
    return {
      fechaDev: d.fecha,
      documento: d.documento,
      valor: val,
      facturasAsociadas: bills.length ? bills.join(", ") : "(ninguna)",
      reconsignado,
      riesgo: reconsignado
        ? "MITIGADO - se volvió a consignar después; VERIFICAR que entró"
        : "CRITICO - factura pagada pero el dinero NO entró al banco",
    };
  });

  // Movimientos bancarios = TODO el extracto (trazabilidad completa)
  const movimientos: Movimiento[] = banco.map((m) => ({
    fecha: m.fecha,
    descripcion: m.descripcion,
    sucursal: m.sucursal,
    valor: m.valor,
  }));

  const totalConc = conciliado.reduce((s, c) => s + c.valorBanco, 0);
  const totalBst = bancoSinTxn.reduce((s, b) => s + b.valorBanco, 0);
  const totalTsb = txnSinBanco.reduce((s, t) => s + t.valorAplicado, 0);

  return {
    conciliado,
    bancoSinTxn,
    txnSinBanco,
    movimientos,
    dev: devAnalisis,
    resumen: {
      periodo,
      nConc: conciliado.length,
      totalConc,
      nBst: bancoSinTxn.length,
      totalBst,
      nTsb: txnSinBanco.length,
      totalTsb,
      nDev: devAnalisis.length,
      nCritico: devAnalisis.filter((d) => d.riesgo.startsWith("CRITICO")).length,
      descuadre: conciliado.filter((c) => c.diferencia !== 0).length,
    },
  };
}
