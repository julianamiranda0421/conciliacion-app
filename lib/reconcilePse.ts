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
// Cada transacción del archivo se enlaza a su(s) factura(s) en DOS pasadas:
//   1) AUTOMÁTICO — por CUS (llave fuerte = `payment_bills.cus`, 1:1 con la transacción).
//   2) MANUAL — pagos aplicados a mano que comparten `s3_path_document` (el comprobante)
//      y tienen cus=null: un solo ingreso PSE se reparte en varios pagos. Se agrupan por
//      s3_path y se enlazan a la transacción ACH cuya suma de montos coincide con el valor.
// Lo que no enlaza por ninguna vía queda como partida conciliatoria pendiente.

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
  cus: string; // llave fuerte (pagos automáticos)
  s3PathDocument: string; // comprobante; agrupa pagos aplicados manualmente
};

export type PseFacturaDetalle = {
  billId: string;
  periodo: string;
  valorFactura: number;
  valorAplicado: number; // efectivo del pago repartido proporcional (sin bia)
  statusFactura: string;
  esParcial: boolean;
};

// Transacción del archivo ACH conciliada (por CUS o por grupo s3_path).
export type PseConciliado = {
  cus: string;
  valorAch: number; // valor del archivo (autoridad)
  fechaAch: string;
  bancoOriginador: string;
  pagador: string; // NIT/CC (Referencia 1)
  otroCiclo: boolean; // fecha del archivo cae en otro mes (arrastre/tránsito)
  tipo: "Automático" | "Manual"; // CUS vs grupo s3_path
  transactionId: number; // representativa (la 1a del grupo si es manual)
  transactionIds: number[]; // todas las transacciones de plataforma enlazadas
  facturas: string[];
  periodo: string;
  valorFactura: number; // Σ total de facturas
  ingresoPlataforma: number; // Σ amount de las transacciones enlazadas
  biaCreditos: number;
  statusFactura: string;
  esParcial: boolean;
  diferencia: number; // valorAch − ingresoPlataforma (debería ~0)
  detalleFacturas: PseFacturaDetalle[];
};

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
  achTotal: number;
  achMes: number;
  achOtroCiclo: number;
  bancoTotal: number;
  diffAchVsBanco: number;
  nConciliado: number;
  nManual: number; // conciliadas por grupo s3 (pago manual)
  valorConciliado: number;
  nPendiente: number;
  valorPendiente: number;
  nFacturas: number;
  pctConciliado: number;
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
const MATCH_TOL = 2; // tolerancia en pesos para el match por valor (grupos s3)

const MESES_ES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function periodMes(period: string): { mes: number; anio: number } | null {
  const m = period.trim().toLowerCase().match(/([a-záéíóú]+)\s+(\d{4})/);
  if (!m) return null;
  const mes = MESES_ES[m[1]];
  const anio = Number(m[2]);
  return mes && anio ? { mes, anio } : null;
}

export function esRecaudoPse(m: BankMovement): boolean {
  return m.valor > 0 && /recaudos?\s+compras?\s+pse/i.test(m.descripcion.trim());
}

// Transacción de plataforma (agrupa las filas factura×pago de un mismo transaction_id).
type Txn = {
  transactionId: number;
  amount: number;
  biaCredits: number;
  paymentDate: string;
  isPartial: boolean;
  cus: string;
  s3: string;
  bills: PseTxn[];
};

export function reconcilePse(
  pseFile: PseRow[],
  pseTxns: PseTxn[],
  banco: BankMovement[],
  period: string,
): PseResult {
  const pm = periodMes(period);

  // Agrupar pagos por transacción. OJO: bills_360 a veces DUPLICA filas del mismo
  // (transaction_id, bill_id) — una con método/cus reales (PSE, cus=308420986) y otra
  // con method "BANK_ACCOUNT/null" y cus=null (visto en bill 82204 / txn 546355). Por
  // eso (a) el cus/s3 de la transacción se toma del valor NO vacío de cualquiera de sus
  // filas (si tomáramos el de la 1a fila y fuera la null, perderíamos el CUS y la
  // transacción caería a pendiente) y (b) las facturas se DEDUPLICAN por bill_id.
  const txnMap = new Map<number, Txn>();
  const seenBills = new Map<number, Set<string>>();
  for (const r of pseTxns) {
    let t = txnMap.get(r.transactionId);
    if (!t) {
      t = {
        transactionId: r.transactionId,
        amount: r2(r.amount),
        biaCredits: r.biaCredits,
        paymentDate: r.paymentDate,
        isPartial: r.isPartial,
        cus: "",
        s3: "",
        bills: [],
      };
      txnMap.set(r.transactionId, t);
      seenBills.set(r.transactionId, new Set());
    }
    const cus = String(r.cus ?? "").trim();
    if (!t.cus && cus) t.cus = cus;
    const s3 = String(r.s3PathDocument ?? "").trim();
    if (!t.s3 && s3) t.s3 = s3;
    const seen = seenBills.get(r.transactionId)!;
    if (!seen.has(r.billId)) {
      seen.add(r.billId);
      t.bills.push(r);
    }
  }
  const byCus = new Map<string, Txn>();
  for (const t of txnMap.values()) if (t.cus) byCus.set(t.cus, t);

  const aprobadas = pseFile.filter((r) => /aprob/i.test(r.estado));
  const esOtroCiclo = (fecha: string): boolean => {
    if (!pm || !fecha) return false;
    const m = fecha.match(/^(\d{4})-(\d{2})/);
    return m ? !(Number(m[1]) === pm.anio && Number(m[2]) === pm.mes) : false;
  };

  const consumed = new Set<number>();
  const matchAuto = new Map<PseRow, Txn>();
  const matchManual = new Map<PseRow, Txn[]>();

  // Pasada 1: CUS (pagos automáticos, 1:1).
  for (const a of aprobadas) {
    const cus = String(a.cus ?? "").trim();
    const t = cus ? byCus.get(cus) : undefined;
    if (t && !consumed.has(t.transactionId)) {
      matchAuto.set(a, t);
      consumed.add(t.transactionId);
    }
  }

  // Grupos por s3_path entre las transacciones AÚN no consumidas (pagos manuales:
  // cus=null que comparten comprobante). Suma de montos por grupo.
  const grupoS3 = new Map<string, Txn[]>();
  for (const t of txnMap.values()) {
    if (consumed.has(t.transactionId) || !t.s3) continue;
    const arr = grupoS3.get(t.s3) ?? [];
    arr.push(t);
    grupoS3.set(t.s3, arr);
  }
  const sumaGrupo = (g: Txn[]) => g.reduce((s, t) => s + t.amount, 0);
  const disponible = (txns: Txn[]) => !txns.some((t) => consumed.has(t.transactionId));

  // Pasada 2: por valor contra grupos s3 (ACH no enlazadas por CUS). Mayor primero.
  const sinCus = aprobadas.filter((a) => !matchAuto.has(a)).sort((x, y) => y.valor - x.valor);

  // 2a) EXACTO (±$2): consume primero los grupos cuya suma calza al peso.
  for (const a of sinCus) {
    for (const [, txns] of grupoS3) {
      if (!disponible(txns)) continue;
      if (Math.abs(sumaGrupo(txns) - a.valor) <= MATCH_TOL) {
        matchManual.set(a, txns);
        for (const t of txns) consumed.add(t.transactionId);
        break;
      }
    }
  }
  // 2b) CERCANO: para las que aún no enlazan, tomar el grupo s3 cuyo monto sea el MÁS
  //     cercano dentro de una tolerancia (1% del valor, máx $100.000). Así el depósito
  //     CRUZA con sus facturas y la diferencia (ej. ACH 4.548.273 vs grupo 4.528.417 de
  //     82582+82662 = $19.856 de retenciones registradas en otro cruce) se MUESTRA en la
  //     columna Diferencia del Recaudo Conciliado, donde la usuaria deja la observación.
  //     El tope $100k evita falsos positivos en montos grandes.
  for (const a of sinCus) {
    if (matchManual.has(a)) continue;
    const tol = Math.min(Math.max(MATCH_TOL, Math.round(a.valor * 0.01)), 100_000);
    let best: Txn[] | null = null;
    let bestDiff = Infinity;
    for (const [, txns] of grupoS3) {
      if (!disponible(txns)) continue;
      const d = Math.abs(sumaGrupo(txns) - a.valor);
      if (d <= tol && d < bestDiff) {
        best = txns;
        bestDiff = d;
      }
    }
    if (best) {
      matchManual.set(a, best);
      for (const t of best) consumed.add(t.transactionId);
    }
  }

  // Construir una partida conciliada desde una transacción ACH + sus pagos de plataforma.
  function build(a: PseRow, txns: Txn[], tipo: "Automático" | "Manual"): PseConciliado {
    const allBills = txns.flatMap((t) => t.bills);
    const ingresoPlataforma = txns.reduce((s, t) => s + t.amount, 0);
    const biaCreditos = txns.reduce((s, t) => s + t.biaCredits, 0);
    const valorFactura = allBills.reduce((s, b) => s + b.total, 0);
    const periodos = [...new Set(allBills.map((b) => b.period).filter(Boolean))] as string[];
    const statuses = [...new Set(allBills.map((b) => b.billStatus).filter(Boolean))] as string[];
    // valorAplicado por factura = efectivo (ingresoPlataforma) repartido proporcional al total.
    const sumTot = valorFactura || 1;
    let resto = ingresoPlataforma;
    const detalleFacturas: PseFacturaDetalle[] = allBills.map((b, i, arr) => {
      const aplicado = i === arr.length - 1 ? resto : Math.round((ingresoPlataforma * b.total) / sumTot);
      resto -= aplicado;
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
      cus: String(a.cus ?? "").trim(),
      valorAch: a.valor,
      fechaAch: a.fecha,
      bancoOriginador: a.bancoOriginador,
      pagador: a.pagador,
      otroCiclo: esOtroCiclo(a.fecha),
      tipo,
      transactionId: txns[0]?.transactionId ?? 0,
      transactionIds: txns.map((t) => t.transactionId),
      facturas: allBills.map((b) => b.billId),
      periodo: periodos.length === 1 ? periodos[0] : periodos.join(", ") || "—",
      valorFactura,
      ingresoPlataforma,
      biaCreditos,
      statusFactura: statuses.length === 1 ? statuses[0] : statuses.join(", ") || "SUCCESS",
      esParcial: txns.some((t) => t.isPartial),
      diferencia: a.valor - ingresoPlataforma,
      detalleFacturas,
    };
  }

  const conciliado: PseConciliado[] = [];
  const pendientes: PsePendiente[] = [];
  for (const a of aprobadas) {
    if (matchAuto.has(a)) conciliado.push(build(a, [matchAuto.get(a)!], "Automático"));
    else if (matchManual.has(a)) conciliado.push(build(a, matchManual.get(a)!, "Manual"));
    else
      pendientes.push({
        cus: String(a.cus ?? "").trim(),
        valor: a.valor,
        fecha: a.fecha,
        bancoOriginador: a.bancoOriginador,
        pagador: a.pagador,
        estado: a.estado,
        otroCiclo: esOtroCiclo(a.fecha),
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
  const nManual = conciliado.filter((c) => c.tipo === "Manual").length;

  // Cuadre por día: archivo ACH vs depósito banco.
  const achDia = new Map<string, number>();
  for (const a of aprobadas) achDia.set(a.fecha, (achDia.get(a.fecha) ?? 0) + a.valor);
  const bancoDia = new Map<string, number>();
  for (const m of pseMov) bancoDia.set(m.fecha, (bancoDia.get(m.fecha) ?? 0) + m.valor);
  const dias = [...new Set([...achDia.keys(), ...bancoDia.keys()])].filter(Boolean).sort();
  const porDia = dias.map((fecha) => {
    const ach = achDia.get(fecha) ?? 0;
    const bnc = bancoDia.get(fecha) ?? 0;
    return { fecha, ach, banco: bnc, diff: bnc - ach };
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
      nManual,
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
