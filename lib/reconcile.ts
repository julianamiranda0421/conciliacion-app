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
  biaCreditos: number;
  totalFactura: number;
  descripcion: string;
  fechaBanco: string;
  fechaPago: string;
  sucursal: string;
  tipo: string;
  nivelMatch: "ALTO" | "MEDIO";
  // Enriquecidos desde bills_360 (se llenan en la página, por transaction_id):
  periodoFactura?: string;
  valorFactura?: number;
  statusFactura?: string;
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
    diferenciaValor: number;
    totalIngresoBanco: number;
    totalDevValor: number;
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
      biaCreditos: t.biaCreditsUsed,
      totalFactura: t.amount + t.biaCreditsUsed,
      descripcion: elegido.descripcion,
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
  const totalIngresoBanco = banco.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0);
  const totalDevValor = devAnalisis.reduce((s, d) => s + d.valor, 0);

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
      diferenciaValor: conciliado.reduce((s, c) => s + Math.abs(c.diferencia), 0),
      totalIngresoBanco,
      totalDevValor,
    },
  };
}

// ---------------------------------------------------------------------------
// Estrategia "1 a muchos" (Davivienda 5571): un Abono ACH ↔ varias facturas
// agrupadas por S3 Path Document. El cruce es por VALOR (suma del grupo ==
// valor del depósito). El banco recibe el Amount; los Bia créditos completan
// la factura (factura = Amount + Bia créditos usados).
// ---------------------------------------------------------------------------
const DAVI_CLIENTES = [
  { nit: "900403787", nombre: "PLASTICOS MONACO" },
  { nit: "860502509", nombre: "PVC GERFOR SAS" },
];

// Configuración del recaudo ACH por cuenta: cómo identificar el depósito
// relevante en el extracto y qué etiqueta mostrar.
export type AchConfig = {
  matchDeposit: (descripcion: string) => boolean;
  clienteLabel: (m: BankMovement) => string;
};

const ACH_CONFIG: Record<string, AchConfig> = {
  "davivienda-5571": {
    matchDeposit: (d) => DAVI_CLIENTES.some((c) => d.includes(c.nit)),
    clienteLabel: (m) =>
      DAVI_CLIENTES.find((c) => m.descripcion.includes(c.nit))?.nombre ?? m.descripcion,
  },
  "bancolombia-1800": {
    matchDeposit: (d) => d.includes("RECAUDO DOMICILIACION ACH"),
    clienteLabel: (m) => m.sucursal || "DOMICILIACION ACH",
  },
  "bancolombia-1144": {
    matchDeposit: (d) => d.includes("PAGO INTERBANC DIR TESORO NACI"),
    clienteLabel: (m) => m.sucursal || "DIR TESORO NACIONAL",
  },
};

// Tolerancia (pesos) para absorber redondeo de centavos del banco al cruzar
// la suma de un grupo con el valor del depósito.
const ACH_TOL = 1;
// Margen máximo (fracción del depósito) para emparejar cuando hay sobrepago o
// pago parcial. La diferencia se reporta como saldo a favor / faltante.
const ACH_MAX_PCT = 0.05;

export function reconcileAch(
  banco: BankMovement[],
  txns: Transaction[],
  periodo: string,
  config: AchConfig,
): ReconResult {
  // Depósitos ACH relevantes para esta cuenta
  const depositos = banco
    .filter((m) => config.matchDeposit(m.descripcion))
    .map((m) => ({ ...m, cliente: config.clienteLabel(m) }));

  // Agrupar pagos manuales por S3 Path Document
  const grupos = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (!t.s3PathDocument) continue;
    const arr = grupos.get(t.s3PathDocument) ?? [];
    arr.push(t);
    grupos.set(t.s3PathDocument, arr);
  }
  const gruposArr = [...grupos.entries()].map(([s3, facturas]) => ({
    s3,
    facturas,
    suma: facturas.reduce((s, f) => s + f.amount, 0),
  }));
  const usados = new Set<string>();
  const asignado: (typeof gruposArr[number] | null)[] = depositos.map(() => null);

  const cercano = (valor: number) => {
    let best: (typeof gruposArr[number]) | null = null;
    let bestDiff = Infinity;
    for (const g of gruposArr) {
      if (usados.has(g.s3)) continue;
      const diff = Math.abs(g.suma - valor);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = g;
      }
    }
    return { best, bestDiff };
  };

  // Pase 1: coincidencia exacta (± centavos)
  depositos.forEach((dep, i) => {
    const { best, bestDiff } = cercano(dep.valor);
    if (best && bestDiff <= ACH_TOL) {
      asignado[i] = best;
      usados.add(best.s3);
    }
  });
  // Pase 2: más cercana dentro de un margen -> sobrepago / pago parcial
  depositos.forEach((dep, i) => {
    if (asignado[i]) return;
    const { best, bestDiff } = cercano(dep.valor);
    if (best && bestDiff <= dep.valor * ACH_MAX_PCT) {
      asignado[i] = best;
      usados.add(best.s3);
    }
  });

  const conciliado: Conciliado[] = [];
  const bancoSinTxn: BancoSinTxn[] = [];

  depositos.forEach((dep, i) => {
    const g = asignado[i];
    if (!g) {
      bancoSinTxn.push({
        fechaBanco: dep.fecha,
        descripcion: dep.descripcion,
        sucursal: dep.cliente,
        billId: dep.billId,
        documento: dep.documento,
        valorBanco: dep.valor,
        nota: "Abono ACH en banco sin aplicación que cuadre en transactions",
      });
      return;
    }
    const filas: Conciliado[] = g.facturas.map((f) => ({
      transactionId: f.transactionId,
      billIdTxn: f.billId,
      billIdBanco: dep.billId,
      valorBanco: f.amount,
      valorAplicado: f.amount,
      diferencia: 0,
      biaCreditos: f.biaCreditsUsed,
      totalFactura: f.amount + f.biaCreditsUsed,
      descripcion: dep.descripcion,
      fechaBanco: dep.fecha,
      fechaPago: f.paymentDate,
      sucursal: dep.cliente,
      tipo: "ACH",
      nivelMatch: "ALTO",
    }));
    // Sobrepago (banco > aplicado) o pago parcial (banco < aplicado): la
    // diferencia queda EN la misma línea de la factura. El valor del banco de
    // esa factura refleja lo que realmente entró (incluye el excedente).
    const saldo = dep.valor - g.suma;
    if (Math.abs(saldo) > ACH_TOL && filas.length) {
      const last = filas[filas.length - 1];
      last.valorBanco += saldo;
      last.diferencia = saldo;
    }
    conciliado.push(...filas);
  });

  const movimientos: Movimiento[] = banco.map((m) => ({
    fecha: m.fecha,
    descripcion: m.descripcion,
    sucursal: m.sucursal,
    valor: m.valor,
  }));

  const totalConc = conciliado.reduce((s, c) => s + c.valorBanco, 0);
  const totalBst = bancoSinTxn.reduce((s, b) => s + b.valorBanco, 0);
  const totalIngresoBanco = banco.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0);

  return {
    conciliado,
    bancoSinTxn,
    txnSinBanco: [],
    movimientos,
    dev: [],
    resumen: {
      periodo,
      nConc: conciliado.length,
      totalConc,
      nBst: bancoSinTxn.length,
      totalBst,
      nTsb: 0,
      totalTsb: 0,
      nDev: 0,
      nCritico: 0,
      descuadre: conciliado.filter((c) => c.diferencia !== 0).length,
      diferenciaValor: conciliado.reduce((s, c) => s + Math.abs(c.diferencia), 0),
      totalIngresoBanco,
      totalDevValor: 0,
    },
  };
}

// Dispatcher por cuenta
export function reconcileForAccount(
  accountId: string,
  banco: BankMovement[],
  txns: Transaction[],
  periodo: string,
): ReconResult {
  const ach = ACH_CONFIG[accountId];
  if (ach) return reconcileAch(banco, txns, periodo, ach);
  return reconcile(banco, txns, periodo);
}
