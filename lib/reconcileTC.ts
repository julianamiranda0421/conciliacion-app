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

// Transacción candidata (de bills_360), una fila por factura pagada por la
// transacción. El monto (amount) es por transacción (se repite por factura).
export type TcTxn = {
  transactionId: number;
  billId: string;
  amount: number; // monto del pago (= Valor Consumo de la adquirencia)
  biaCredits: number; // por transacción
  total: number; // valor de ESTA factura (bills_360.total)
  paymentDate: string; // YYYY-MM-DD
  period: string | null; // período de la factura
  billStatus: string | null;
  methodType: string; // CREDIT_CARD / BANK_ACCOUNT (PSE) / ...
  methodName: string;
  isPartial: boolean; // pago parcial (la factura tiene varios pagos)
};

// Detalle por factura del pago (para el drawer): un pago puede cubrir varias facturas.
// Σ valorFactura = consumo (pago) + bia créditos.
export type TcFacturaDetalle = {
  billId: string;
  periodo: string;
  valorFactura: number; // bills_360.total de la factura
  valorAplicado: number; // lo aplicado del pago a esa factura (< total si es pago parcial)
  statusFactura: string; // bill_status (SUCCESS / ...)
  esParcial: boolean; // is_partial_payment (la factura tiene varios pagos)
};

export type TcLink = {
  transactionId: number;
  facturas: string[];
  periodo: string;
  statusFactura: string;
  biaCreditos: number;
  metodo: string;
  esParcial: boolean;
  detalleFacturas: TcFacturaDetalle[];
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
  consumoEnlazado: number; // valor aplicado (consumo) de las adquirencias que cruzaron a factura
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
  // Agrupar las filas por transacción (amount/biaCredits se repiten por factura).
  type Txn = { transactionId: number; amount: number; biaCredits: number; paymentDate: string; methodType: string; isPartial: boolean; bills: TcTxn[] };
  const txnMap = new Map<number, Txn>();
  for (const r of tcRows) {
    let t = txnMap.get(r.transactionId);
    if (!t) {
      t = { transactionId: r.transactionId, amount: r2(r.amount), biaCredits: r.biaCredits, paymentDate: r.paymentDate, methodType: r.methodType, isPartial: r.isPartial, bills: [] };
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
    // Desempate: primero tarjeta de crédito, luego fecha más cercana al cargo.
    const ref = a.fechaVale || a.fechaAbono;
    const elegido = cands.sort((x, y) => {
      const cx = x.methodType === "CREDIT_CARD" ? 0 : 1;
      const cy = y.methodType === "CREDIT_CARD" ? 0 : 1;
      if (cx !== cy) return cx - cy;
      return dayDist(x.paymentDate, ref) - dayDist(y.paymentDate, ref);
    })[0];
    usados.add(elegido.transactionId);
    const periodos = [...new Set(elegido.bills.map((b) => b.period).filter(Boolean))] as string[];
    const statuses = [...new Set(elegido.bills.map((b) => b.billStatus).filter(Boolean))] as string[];
    linkByAdq.set(a, {
      transactionId: elegido.transactionId,
      facturas: elegido.bills.map((b) => b.billId),
      periodo: periodos[0] ?? "—",
      statusFactura: statuses.length === 1 ? statuses[0] : statuses.join(", ") || "SUCCESS",
      biaCreditos: elegido.biaCredits,
      metodo: elegido.methodType,
      esParcial: elegido.isPartial,
      // Detalle por factura para el drawer. valorAplicado = EFECTIVO del pago (consumo)
      // repartido proporcional al valor de cada factura; NO incluye bia créditos. Así
      // valorAplicado + bia = valor factura (Σ valorAplicado = consumo; la diferencia con
      // el valor factura la cubren los bia créditos o, si es parcial, queda como faltante).
      detalleFacturas: (() => {
        const sumTot = elegido.bills.reduce((s, b) => s + b.total, 0) || 1;
        let restoCash = elegido.amount;
        return elegido.bills.map((b, i, arr) => {
          const aplicado = i === arr.length - 1 ? restoCash : Math.round((elegido.amount * b.total) / sumTot);
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
      })(),
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
  // Valor aplicado de las adquirencias que SÍ cruzaron a factura (consumo de las enlazadas).
  const consumoEnlazado = detalle.filter((d) => d.link).reduce((s, d) => s + d.consumo, 0);

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
      consumoEnlazado,
      diffNetoVsBanco: bancoNCTotal - totalNeto,
      porDia,
    },
  };
}
