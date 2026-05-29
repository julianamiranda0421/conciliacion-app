// Catálogo de cuentas bancarias a conciliar.
// La fase 1 implementa Bancolombia 8465 (recaudo efectivo/cheque).
// Las demás quedan registradas para irlas habilitando.

export type BankAccount = {
  id: string;
  bank: string;
  accountNumber: string;
  alias: string;
  type: "recaudo" | "pagos" | "general";
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
    enabled: true,
  },
  {
    id: "bancolombia-1800",
    bank: "Bancolombia",
    accountNumber: "1800",
    alias: "Bancolombia 1800",
    type: "general",
    enabled: false,
  },
  {
    id: "bancolombia-1144",
    bank: "Bancolombia",
    accountNumber: "1144",
    alias: "Bancolombia 1144",
    type: "general",
    enabled: false,
  },
  {
    id: "davivienda-5571",
    bank: "Davivienda",
    accountNumber: "5571",
    alias: "Davivienda 5571",
    type: "general",
    enabled: false,
  },
  {
    id: "davivienda-7772",
    bank: "Davivienda",
    accountNumber: "7772",
    alias: "Davivienda 7772",
    type: "general",
    enabled: false,
  },
  {
    id: "adquirencias",
    bank: "Adquirencias",
    accountNumber: "",
    alias: "Adquirencias · Recaudo por tarjetas/pasarela",
    type: "pagos",
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
