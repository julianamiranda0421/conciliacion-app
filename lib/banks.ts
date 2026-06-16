// Catálogo de cuentas bancarias a conciliar.
// La fase 1 implementa Bancolombia 8465 (recaudo efectivo/cheque).
// Las demás quedan registradas para irlas habilitando.

export type BankAccount = {
  id: string;
  bank: string;
  accountNumber: string;
  alias: string;
  type: "recaudo" | "pagos" | "general";
  /** Formato del extracto del banco para esta cuenta. */
  format: "pdf" | "excel";
  /** ¿El parser/conciliador ya está implementado para esta cuenta? */
  enabled: boolean;
};

export const BANK_ACCOUNTS: BankAccount[] = [
  {
    id: "bancolombia-8465",
    bank: "Bancolombia",
    accountNumber: "8465",
    alias: "Bancolombia 8465 · Recaudo efectivo/cheque",
    type: "recaudo",
    format: "pdf",
    enabled: true,
  },
  {
    id: "davivienda-5571",
    bank: "Davivienda",
    accountNumber: "5571",
    alias: "Davivienda 5571 · Recaudo ACH (PLASTICOS MONACO, PVC GERFOR)",
    type: "recaudo",
    format: "excel",
    enabled: true,
  },
  {
    id: "bancolombia-1800",
    bank: "Bancolombia",
    accountNumber: "1800",
    alias: "Bancolombia 1800 · Recaudo domiciliación ACH",
    type: "recaudo",
    format: "pdf",
    enabled: true,
  },
  {
    id: "bancolombia-1144",
    bank: "Bancolombia",
    accountNumber: "1144",
    alias: "Bancolombia 1144 · Recaudo pago interbancario (DIR Tesoro Nacional)",
    type: "recaudo",
    format: "pdf",
    enabled: true,
  },
  {
    id: "davivienda-7772",
    bank: "Davivienda",
    accountNumber: "7772",
    alias: "Davivienda 7772 · Recaudo cheque / tarjeta / PSE",
    type: "recaudo",
    format: "excel",
    enabled: true,
  },
  {
    id: "adquirencias",
    bank: "Adquirencias",
    accountNumber: "",
    alias: "Adquirencias · Recaudo por tarjeta de crédito (TC) del 7772",
    type: "pagos",
    format: "excel",
    enabled: true,
  },
];

// Cuentas que se concilian de forma independiente (tienen su propio extracto y
// vista de detalle). Las de tipo "pagos" (ej. adquirencias) son cargas que
// alimentan la conciliación de otra cuenta, así que NO aparecen como conciliación
// propia, pero sí se pueden cargar desde Cargas.
export const CONCILIABLE_ACCOUNTS = BANK_ACCOUNTS.filter((a) => a.type !== "pagos");

export function getAccount(id: string): BankAccount | undefined {
  return BANK_ACCOUNTS.find((a) => a.id === id);
}

export function accountLabel(id: string): string {
  const a = getAccount(id);
  if (!a) return id;
  return `${a.bank}${a.accountNumber ? " " + a.accountNumber : ""}`;
}

export const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
