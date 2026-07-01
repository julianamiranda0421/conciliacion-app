// Motor de conciliación 360 — cuenta 8465 Bancolombia.
// Porta la lógica de conciliar.py: cruce con llave principal = Bill ID
// (factura), el valor confirma/desempata, y robustez a referencias recortadas.

import type { BankMovement } from "./parseBank";
import type { Transaction } from "./parseTransactions";

// Conceptos de recaudo (ingreso) del extracto Bancolombia 8465. Se matchean por
// PREFIJO (el PDF a veces trunca la descripción, ej. "...RIN CHEQU" por "CHEQUE").
//  - "RECAUDO VALIDACION EFECTIVO/CHEQUE": recaudo físico normal.
//  - "RIN-RECAUDO ESPECIAL RIN EFECT/CHEQU": recaudo especial (RIN), mismo efecto.
const CONCEPTOS_RECAUDO = [
  "RECAUDO VALIDACION",
  "RIN-RECAUDO ESPECIAL",
];

// Config de la conciliación de recaudo físico/cheque (match por factura, valor
// confirma). Por defecto = Bancolombia 8465 (concepto recaudo + factura en ref1).
export type ChequeConfig = {
  conceptos: string[];
  billOf: (m: BankMovement) => string;
  // Si true: el recaudo se aplica por VARIOS métodos de pago, así que se cruza
  // contra cualquier transacción cuya factura aparezca en el recaudo del banco
  // (no se restringe por método). Útil para Davivienda 7772.
  restrictTxnsToRecaudoBills?: boolean;
  // Si true (junto con restrictTxnsToRecaudoBills): el recaudo también cruza contra
  // transacciones cuyo VALOR coincida con un recaudo del banco aunque la factura no
  // aparezca exacta (factura recortada/distinta). Hace el cruce MÉTODO-AGNÓSTICO sin
  // meter ruido: el extracto del banco ("RECAUDO VALIDACION") es la autoridad, no el
  // método con que la plataforma haya etiquetado el pago (a veces "no identificado").
  // Útil para Bancolombia 8465.
  restrictAlsoByValue?: boolean;
  // Si true: la cuenta tiene VARIOS canales en el mismo extracto (físico + TC + PSE),
  // así que "ingreso al banco" y "movimientos" de esta vista se limitan al recaudo
  // físico/cheque (no a todos los positivos del extracto). Útil para Davivienda 7772.
  multiChannel?: boolean;
  // Refuerzo de la llave por MÉTODO de pago de Cartera 360: identifica las
  // transacciones que "pertenecen" a esta cuenta (ej. 8465 = PHYSICAL / Integración
  // Bancolombia). No bloquea: si no hay una del método pero calza el valor, igual
  // cruza; pero cuando varias transacciones calzan por valor, la del método tiene
  // prioridad y sube el nivel del cruce (evita que un PSE/TC del mismo monto se robe
  // el recaudo físico).
  metodoDeCuenta?: (t: Transaction) => boolean;
};
const DEFAULT_CHEQUE: ChequeConfig = {
  conceptos: CONCEPTOS_RECAUDO,
  billOf: (m) => m.billId,
};

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
  nivelMatch: "ALTO" | "MEDIO-ALTO" | "MEDIO";
  // Enriquecidos desde bills_360 (se llenan en la página, por transaction_id):
  periodoFactura?: string;
  valorFactura?: number;
  statusFactura?: string;
  pago?: string; // "OK" | "Pago parcial" (según is_partial_payment de bills_360)
  observacion?: string; // nota manual (persistida por transaction_id)
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
  tran: string; // "Nota Crédito" (ingreso) | "Nota Débito" (egreso), según el signo
};

export type DevAnalisis = {
  fechaDev: string;
  documento: string;
  descripcion: string; // concepto del banco (ej. "DEV CHEQUE CONSIG CAUSAL 26")
  valor: number;
  facturasAsociadas: string;
  reconsignado: boolean;
  riesgo: string;
  observacion?: string; // nota manual (persistida por documento del cheque)
};

// Partida conciliatoria pendiente: centraliza recaudos que no cruzaron, pagos
// aplicados sin ingreso al banco, y cheques devueltos (con signo negativo).
export type Pendiente = {
  fecha: string;
  concepto: string;
  punto: string;
  billId: string;
  valor: number; // con signo del banco (los cheques devueltos van negativos)
  status: string; // "Cheque devuelto" | "Pago no aplicado" | "Recaudo sin cruzar" | ...
  transactionId?: number;
  sig?: string; // firma del movimiento (para clasificación manual recaudo)
  manual?: boolean; // true si fue marcado como recaudo a mano (se puede borrar)
};

// Firma estable de un movimiento bancario para clasificación manual persistente.
export function movementSig(m: BankMovement): string {
  return [m.fecha, m.descripcion, m.valor, m.documento, m.ref2].join("|");
}

export type ReconResult = {
  conciliado: Conciliado[];
  bancoSinTxn: BancoSinTxn[];
  txnSinBanco: TxnSinBanco[];
  pendientes: Pendiente[];
  recaudoPendiente?: Pendiente[]; // cuentas ACH: recaudo sin cruzar (auto + manual)
  otrosIngresos?: Pendiente[]; // cuentas ACH: ingresos que no son recaudo
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
    totalPendiente: number;
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
  cfg: ChequeConfig = DEFAULT_CHEQUE,
): ReconResult {
  const recaudos = banco
    .filter((m) => cfg.conceptos.some((c) => m.descripcion.startsWith(c)))
    .map((m, i) => ({ ...m, _i: i, usado: false, bill: cfg.billOf(m) }));

  const dev = banco.filter((m) => m.descripcion.startsWith("DEV CHEQUE"));

  const conciliado: Conciliado[] = [];
  const txnSinBanco: TxnSinBanco[] = [];

  // Cuando el recaudo se aplica por varios métodos (7772), solo se consideran las
  // transacciones cuya factura aparece en el recaudo del banco (match por factura).
  const recaudoBills = new Set(recaudos.map((r) => r.bill));
  const recaudoValores = new Set(recaudos.map((r) => r.valor));
  const txnsToMatch = cfg.restrictTxnsToRecaudoBills
    ? txns.filter(
        (t) =>
          recaudoBills.has(t.billId) ||
          (cfg.restrictAlsoByValue && recaudoValores.has(t.amount)),
      )
    : txns;

  // Si la cuenta define un método propio (ej. 8465 = físico/Integración Bancolombia),
  // sus transacciones se procesan PRIMERO para que reclamen su recaudo antes de que un
  // pago de otro método (PSE/TC) del mismo valor se lo lleve. Orden estable (V8).
  const metodoDe = cfg.metodoDeCuenta;
  const ordenadas = metodoDe
    ? [...txnsToMatch].sort((a, b) => (metodoDe(a) ? 0 : 1) - (metodoDe(b) ? 0 : 1))
    : txnsToMatch;

  for (const t of ordenadas) {
    const disponibles = recaudos.filter((r) => !r.usado);
    const porFactura = disponibles.filter((r) => r.bill === t.billId);
    const esMetodo = metodoDe ? metodoDe(t) : false;

    let elegido: (typeof recaudos)[number] | undefined;
    let nivel: "ALTO" | "MEDIO-ALTO" | "MEDIO";

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
      const compat = porValor.filter((r) => billCompatible(r.bill, t.billId));
      const pool = compat.length ? compat : porValor;
      elegido = [...pool].sort(
        (a, b) => dayDist(a.fecha, t.paymentDate) - dayDist(b.fecha, t.paymentDate),
      )[0];
      // Cruce por valor: si además el método es el de la cuenta, sube la confianza.
      nivel = esMetodo ? "MEDIO-ALTO" : "MEDIO";
    }

    recaudos[elegido._i].usado = true;
    conciliado.push({
      transactionId: t.transactionId,
      billIdTxn: t.billId,
      billIdBanco: elegido.bill,
      valorBanco: elegido.valor,
      valorAplicado: t.amount,
      diferencia: t.amount - elegido.valor,
      biaCreditos: t.biaCreditsUsed,
      totalFactura: t.amount + t.biaCreditsUsed,
      descripcion: elegido.descripcion,
      fechaBanco: elegido.fecha,
      fechaPago: t.paymentDate,
      sucursal: elegido.sucursal,
      tipo: elegido.descripcion.includes("CHEQU") ? "CHEQUE" : "EFECTIVO",
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
      billId: r.bill,
      documento: r.documento,
      valorBanco: r.valor,
      nota: devValores.has(r.valor)
        ? "Recaudo reversado por cheque devuelto (DEV CHEQUE)"
        : "En banco, sin registro en transactions",
    }));

  // Análisis de cheques devueltos. `montoAbs` es la magnitud (positiva) para
  // cruzar contra recaudos/transacciones; el `valor` que se muestra va NEGATIVO
  // porque una devolución es una salida (resta del banco) → sale en rojo.
  const devAnalisis: DevAnalisis[] = dev.map((d) => {
    const montoAbs = -d.valor;
    const recaudosVal = recaudos.filter((r) => r.valor === montoAbs);
    const reconsignado = recaudosVal.some((r) => Date.parse(r.fecha) > Date.parse(d.fecha));
    const bills = txns.filter((t) => t.amount === montoAbs).map((t) => t.billId);
    return {
      fechaDev: d.fecha,
      documento: d.documento,
      descripcion: d.descripcion,
      valor: -montoAbs,
      facturasAsociadas: bills.length ? bills.join(", ") : "(ninguna)",
      reconsignado,
      riesgo: reconsignado
        ? "MITIGADO - se volvió a consignar después; VERIFICAR que entró"
        : "CRITICO - factura pagada pero el dinero NO entró al banco",
    };
  });

  // Movimientos bancarios: por defecto TODO el extracto (trazabilidad). En cuentas
  // multicanal (7772) esta vista es solo del recaudo físico/cheque; el extracto
  // completo va en la pestaña Resumen.
  const esRecaudoMov = (m: BankMovement) => cfg.conceptos.some((c) => m.descripcion.startsWith(c));
  const movsView = cfg.multiChannel ? banco.filter(esRecaudoMov) : banco;
  const movimientos: Movimiento[] = movsView.map((m) => ({
    fecha: m.fecha,
    descripcion: m.descripcion,
    sucursal: m.sucursal,
    valor: m.valor,
    tran: m.valor < 0 ? "Nota Débito" : "Nota Crédito",
  }));

  // Partidas conciliatorias pendientes (centralizado): recaudos sin cruzar,
  // pagos aplicados sin ingreso y los cheques devueltos (signo negativo).
  const pendientes: Pendiente[] = [
    ...bancoSinTxn.map((b) => ({
      fecha: b.fechaBanco,
      concepto: b.descripcion,
      punto: b.sucursal,
      billId: b.billId,
      valor: b.valorBanco,
      status: devValores.has(b.valorBanco) ? "Cheque devuelto" : "Recaudo sin cruzar",
    })),
    ...txnSinBanco.map((t) => ({
      fecha: t.fechaPago,
      concepto: "Pago aplicado sin ingreso al banco",
      punto: "",
      billId: t.billId,
      valor: t.valorAplicado,
      status: "Pago no aplicado",
      transactionId: t.transactionId,
    })),
    ...devAnalisis.map((d) => ({
      fecha: d.fechaDev,
      concepto: "DEV CHEQUE (devolución)",
      punto: "",
      billId: "",
      valor: d.valor, // ya es negativo (la devolución resta del banco)
      status: "Cheque devuelto",
    })),
  ];

  const totalConc = conciliado.reduce((s, c) => s + c.valorBanco, 0);
  const totalBst = bancoSinTxn.reduce((s, b) => s + b.valorBanco, 0);
  const totalTsb = txnSinBanco.reduce((s, t) => s + t.valorAplicado, 0);
  // Ingreso al banco. En cuenta multicanal (7772) = solo el recaudo físico/cheque
  // (los positivos de PSE/TC se reportan en sus propias pestañas y en el Resumen).
  // En cuenta de un solo canal (8465) = todos los positivos del extracto.
  const positivesGross = cfg.multiChannel
    ? recaudos.reduce((s, r) => s + r.valor, 0)
    : banco.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0);
  // Magnitud (positiva) de los cheques devueltos; el detalle los muestra negativos.
  const totalDevValor = devAnalisis.reduce((s, d) => s + Math.abs(d.valor), 0);
  // Los cheques devueltos reversan el ingreso (efecto cero), así que se restan
  // del total para reflejar el ingreso neto real que quedó en la cuenta.
  const totalIngresoBanco = positivesGross - totalDevValor;
  const totalPendiente = pendientes.reduce((s, p) => s + p.valor, 0);

  return {
    conciliado,
    bancoSinTxn,
    txnSinBanco,
    pendientes,
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
      totalPendiente,
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
  flags?: Set<string>,
): ReconResult {
  // Depósitos ACH relevantes para esta cuenta
  const depositos = banco
    .filter((m) => config.matchDeposit(m.descripcion))
    .map((m) => ({ ...m, cliente: config.clienteLabel(m) }));

  // Agrupar las facturas de un mismo giro. La llave es el payment_date completo
  // (paymentGroup): en bills_360 todas las facturas pagadas en un mismo giro ACH
  // comparten ese timestamp exacto. Antes se usaba el comprobante S3 (screenshot
  // manual); ahora el timestamp lo reemplaza. Fallback a s3 si no hay paymentGroup.
  const grupos = new Map<string, Transaction[]>();
  for (const t of txns) {
    const key = t.paymentGroup || t.s3PathDocument;
    if (!key) continue;
    const arr = grupos.get(key) ?? [];
    arr.push(t);
    grupos.set(key, arr);
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
    tran: m.valor < 0 ? "Nota Débito" : "Nota Crédito",
  }));

  // Firma de los depósitos de recaudo que SÍ cruzaron (ya conciliados).
  const matchedSig = new Set<string>();
  depositos.forEach((dep, i) => {
    if (asignado[i]) matchedSig.add(movementSig(dep));
  });

  // Repartir los INGRESOS (notas crédito = positivos) no conciliados en dos grupos:
  //  - recaudoPendiente: recaudo (auto por concepto, o marcado a mano) que no cruzó.
  //  - otrosIngresos: ingresos que no son recaudo.
  const flagsSet = flags ?? new Set<string>();
  const recaudoPendiente: Pendiente[] = [];
  const otrosIngresos: Pendiente[] = [];
  for (const m of banco) {
    if (m.valor <= 0) continue; // los egresos (notas débito) no aplican
    const s = movementSig(m);
    if (matchedSig.has(s)) continue; // ya conciliado
    const esRecaudoAuto = config.matchDeposit(m.descripcion);
    const esRecaudoManual = flagsSet.has(s);
    const esRecaudo = esRecaudoAuto || esRecaudoManual;
    const row: Pendiente = {
      fecha: m.fecha,
      concepto: m.descripcion,
      punto: m.sucursal,
      billId: m.billId,
      valor: m.valor,
      status: esRecaudo ? "Partida conciliatoria" : "Ok",
      sig: s,
      manual: esRecaudoManual && !esRecaudoAuto,
    };
    if (esRecaudo) recaudoPendiente.push(row);
    else otrosIngresos.push(row);
  }

  const totalConc = conciliado.reduce((s, c) => s + c.valorBanco, 0);
  const totalBst = bancoSinTxn.reduce((s, b) => s + b.valorBanco, 0);
  // Ingreso al banco = TODO lo que ingresó (notas crédito = positivos), sea recaudo o no.
  const totalIngresoBanco = banco.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0);
  // Pendiente por conciliar = SOLO el recaudo pendiente (auto + marcado a mano).
  const totalPendiente = recaudoPendiente.reduce((s, p) => s + p.valor, 0);

  return {
    conciliado,
    bancoSinTxn,
    txnSinBanco: [],
    pendientes: recaudoPendiente,
    recaudoPendiente,
    otrosIngresos,
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
      totalPendiente,
    },
  };
}

// Dispatcher por cuenta
// Recaudo físico/cheque por cuenta cuando NO es Bancolombia 8465.
const CHEQUE_CONFIG: Record<string, ChequeConfig> = {
  // Bancolombia 8465: recaudo físico efectivo/cheque. El recaudo del banco cruza
  // contra cualquier pago SUCCESS de esa factura/valor SIN depender del método con
  // que la plataforma lo etiquetó (a veces "Método de pago no identificado"/BANK).
  // restrictAlsoByValue evita el ruido y conserva los cruces por valor (factura recortada).
  "bancolombia-8465": {
    conceptos: CONCEPTOS_RECAUDO,
    billOf: (m) => m.billId,
    restrictTxnsToRecaudoBills: true,
    restrictAlsoByValue: true,
    // A la 8465 solo entra recaudo FÍSICO por la integración Bancolombia (efectivo o
    // cheque). Ese método identifica las transacciones que pertenecen a esta cuenta.
    metodoDeCuenta: (t) =>
      t.paymentMethodType === "PHYSICAL" && /integraci[oó]n\s+bancolombia/i.test(t.paymentMethodName),
  },
  // Davivienda 7772: recaudo físico/cheque. Conceptos del extracto y la factura
  // va en Referencia 1 (parser la deja en ref2, con ceros a la izquierda).
  "davivienda-7772": {
    conceptos: ["Deposito Efectivo en Oficina", "Ajuste pago BIA ENERGY REC FACTURAS"],
    billOf: (m) => m.ref2.replace(/^0+/, ""),
    restrictTxnsToRecaudoBills: true,
    multiChannel: true,
  },
};

export function reconcileForAccount(
  accountId: string,
  banco: BankMovement[],
  txns: Transaction[],
  periodo: string,
  flags?: Set<string>,
): ReconResult {
  const ach = ACH_CONFIG[accountId];
  if (ach) return reconcileAch(banco, txns, periodo, ach, flags);
  const chq = CHEQUE_CONFIG[accountId];
  if (chq) return reconcile(banco, txns, periodo, chq);
  return reconcile(banco, txns, periodo);
}
