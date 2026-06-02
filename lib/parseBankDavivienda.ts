// Parser del extracto de Davivienda (Excel). El encabezado real está en la
// segunda fila; los datos traen "Desc Mot." (concepto) y "Valor Total".

import * as XLSX from "xlsx";
import type { BankMovement } from "./parseBank";

type Row = Record<string, unknown>;

function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return v.slice(0, 10);
  return "";
}

export function parseBankDavivienda(data: Uint8Array): BankMovement[] {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // range:1 -> usa la 2da fila como encabezado (la 1ra es el título "Movimientos")
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { range: 1, defval: null });

  const out: BankMovement[] = [];
  for (const r of rows) {
    const desc = String(r["Desc Mot."] ?? "").trim();
    const valor = Number(r["Valor Total"]);
    if (!desc || isNaN(valor)) continue;
    const idOrigen = String(r["ID Origen/Destino"] ?? "").replace(/\D/g, "").replace(/^0+/, "");
    out.push({
      fecha: toDateStr(r["Fecha"]),
      descripcion: desc,
      sucursal: String(r["Ciudad"] ?? "").trim(),
      ref1: idOrigen,
      ref2: String(r["Referencia 1"] ?? "").replace(/'/g, "").trim(),
      documento: String(r["Doc."] ?? "").trim(),
      valor,
      billId: idOrigen, // para Davivienda guardamos el NIT en billId
    });
  }
  return out;
}
