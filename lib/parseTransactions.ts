// Tipos y filtros de las transactions que consume el motor de conciliación.
// La fuente es bills_360 (espejo de Metabase); ya no hay cargue manual de Excel.
// filterForAccount -> subconjunto que aplica a una cuenta bancaria concreta.

export type TxnRow = {
  transactionId: number;
  billId: string;
  amount: number;
  paymentMethodType: string;
  paymentMethodName: string;
  status: string;
  paymentDate: string; // YYYY-MM-DD
  collectionType: string;
  biaCreditsUsed: number;
  s3PathDocument: string; // link del comprobante = aplicación manual si no está vacío
  // Llave de agrupación de un giro/depósito ACH: el payment_date completo (timestamp).
  // En bills_360 todas las facturas de un mismo giro comparten este timestamp exacto,
  // así que reemplaza al "comprobante" (screenshot) que antes se agrupaba a mano.
  paymentGroup?: string;
};

// Forma reducida que consume el motor de conciliación.
export type Transaction = {
  transactionId: number;
  billId: string;
  amount: number;
  paymentDate: string;
  collectionType: string;
  biaCreditsUsed: number;
  s3PathDocument: string;
  paymentGroup?: string; // timestamp del giro (llave de agrupación ACH)
  // Método de pago de Cartera 360: sirve como refuerzo de la llave (ej. la 8465
  // solo recibe PHYSICAL / "Integración Bancolombia").
  paymentMethodType: string;
  paymentMethodName: string;
};

const map = (r: TxnRow): Transaction => ({
  transactionId: r.transactionId,
  billId: r.billId,
  amount: r.amount,
  paymentDate: r.paymentDate,
  collectionType: r.collectionType,
  biaCreditsUsed: r.biaCreditsUsed,
  s3PathDocument: r.s3PathDocument,
  paymentGroup: r.paymentGroup,
  paymentMethodType: r.paymentMethodType,
  paymentMethodName: r.paymentMethodName,
});

// ¿Es una transferencia bancaria manual? (FINANCE_TRANSFER / "Transferencia bancaria").
// Es el canal por el que entran los recaudos ACH de 5571 / 1800 / 1144: varias facturas
// pagadas en un mismo giro (mismo payment_date), que el motor agrupa por ese timestamp.
function esTransferencia(r: TxnRow): boolean {
  return (
    r.paymentMethodType === "FINANCE_TRANSFER" ||
    r.paymentMethodName.toLowerCase().includes("transferencia")
  );
}

// Filtro de transactions que entran a cada cuenta bancaria.
// Fuente = bills_360 (Metabase). El recaudo de cada cuenta llega por un canal distinto:
//  - 8465: recaudo físico efectivo/cheque; se pasan TODAS las txns y el motor cruza por
//    factura/valor del recaudo del banco (método-agnóstico, ver reconcile.ts).
//  - 5571/1800/1144: transferencias bancarias (FINANCE_TRANSFER); el motor agrupa por giro
//    (payment_date) y cuadra cada depósito del banco por valor.
//  - 7772: cheque/físico aplicado por varios métodos; se pasan TODAS y el motor cruza por factura.
export function filterForAccount(accountId: string, rows: TxnRow[]): Transaction[] {
  switch (accountId) {
    case "bancolombia-8465":
      // Método-agnóstico: el recaudo físico a veces se registra con método "no
      // identificado"/BANK en vez de Bancolombia/PHYSICAL. El motor (reconcile con
      // restrictTxnsToRecaudoBills + restrictAlsoByValue) las restringe por factura/valor
      // del recaudo del banco, que es la autoridad. Se pasan TODAS las transacciones.
      return rows.map(map);
    case "davivienda-5571":
    case "bancolombia-1800":
    case "bancolombia-1144":
      return rows.filter(esTransferencia).map(map);
    case "davivienda-7772":
      return rows.map(map);
    default:
      return [];
  }
}
