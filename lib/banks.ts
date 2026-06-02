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
    alias: "Bancolombia 1800",
    type: "general",
    format: "pdf",
    enabled: false,
  },
  {
    id: "bancolombia-1144",
    bank: "Bancolombia",
    accountNumber: "1144",
    alias: "Bancolombia 1144",
    type: "general",
    format: "pdf",
    enabled: false,
  },
  {
    id: "davivienda-7772",
    bank: "Davivienda",
    accountNumber: "7772",
    alias: "Davivienda 7772",
    type: "general",
    format: "excel",
    enabled: false,
  },
  {
    id: "adquirencias",
    bank: "Adquirencias",
    accountNumber: "",
    alias: "Adquirencias · Recaudo por tarjetas/pasarela",
    type: "pagos",
    format: "excel",
    enabled: false,
  },
];

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
