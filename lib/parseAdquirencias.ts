// Parser del archivo de adquirencias (Excel) del recaudo por TARJETA DE CRÉDITO.
// Cada fila es un cargo TC: Valor Consumo = valor de la factura; las comisiones
// (Valor Comision + retenciones) se descuentan y queda el Valor Neto, que es lo
// que realmente ingresa al banco (las "Nc ..." del extracto del 7772).

import * as XLSX from "xlsx";

export type Adquirencia = {
  fechaVale: string; // YYYY-MM-DD (fecha del cargo)
  fechaAbono: string; // YYYY-MM-DD (fecha en que el banco abona el neto)
  red: string;
  terminal: string;
  numAutoriza: string;
  tarjeta: string; // últimos dígitos enmascarados
  tipoTarjeta: string; // CREDITO NACIONAL / MASTERDEBIT / ...
  consumo: number; // valor de la factura (lo que se cargó a la tarjeta)
  comision: number; // Valor Comision
  reteFuente: number;
  reteIva: number;
  reteIca: number;
  neto: number; // consumo − comisiones = ingreso al banco
  comisionTotal: number; // consumo − neto (todas las deducciones)
};

type Row = Record<string, unknown>;

function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return v.slice(0, 10);
  return "";
}
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function parseAdquirencias(data: Uint8Array): Adquirencia[] {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null });

  const out: Adquirencia[] = [];
  for (const r of rows) {
    const consumo = num(r["Valor Consumo"]);
    const neto = num(r["Valor Neto"]);
    if (consumo <= 0 && neto <= 0) continue; // filas vacías / totales
    out.push({
      fechaVale: toDateStr(r["Fecha Vale"]),
      fechaAbono: toDateStr(r["Fecha Abono"]),
      red: String(r["Red"] ?? "").replace(/\.$/, "").trim(),
      terminal: String(r["Terminal"] ?? "").trim(),
      numAutoriza: String(r["Numero Autoriza"] ?? "").trim(),
      tarjeta: String(r["Tarjeta Socio"] ?? "").replace(/\.$/, "").trim(),
      tipoTarjeta: String(r["Tipo Tarjeta"] ?? "").replace(/\.$/, "").trim(),
      consumo,
      comision: num(r["Valor Comision"]),
      reteFuente: num(r["Ret. Fuente"]),
      reteIva: num(r["Ret. IVA"]),
      reteIca: num(r["Ret. ICA"]),
      neto,
      comisionTotal: consumo - neto,
    });
  }
  return out;
}
