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
  // Detectar la fila de encabezado en vez de asumir que es la 2da: Davivienda a veces
  // antepone más de una fila de título. Se busca la fila que tiene "Desc Mot." y
  // "Valor Total". Si no se halla, se cae al comportamiento anterior (2da fila).
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  const norm = (c: unknown) => String(c ?? "").trim().toLowerCase();
  let headerIdx = aoa.findIndex((row) => {
    const cells = (row as unknown[]).map(norm);
    return cells.some((c) => c.startsWith("desc mot")) && cells.some((c) => c.includes("valor total"));
  });
  if (headerIdx < 0) headerIdx = 1;
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { range: headerIdx, defval: null });

  // Columna "Tran": Nota Credito = ingreso (+), Nota Debito = egreso (−).
  // Todos los valores vienen positivos; el signo se deriva de esta columna.
  const tranKey = Object.keys(rows[0] ?? {}).find((k) =>
    k.trim().toLowerCase().startsWith("tran"),
  );

  const out: BankMovement[] = [];
  for (const r of rows) {
    const desc = String(r["Desc Mot."] ?? "").trim();
    const rawValor = Number(r["Valor Total"]);
    if (!desc || isNaN(rawValor)) continue;
    const tran = String((tranKey ? r[tranKey] : "") ?? "").toLowerCase();
    const esDebito = tran.includes("debito") || tran.includes("débito");
    const valor = esDebito ? -Math.abs(rawValor) : Math.abs(rawValor);
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
