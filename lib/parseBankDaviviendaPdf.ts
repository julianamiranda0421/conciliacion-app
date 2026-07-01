// Parser del ESTADO DE CUENTA oficial de Davivienda (PDF). Trae el bloque de saldos
// (Saldo Anterior / Más Créditos / Menos Débitos / Nuevo Saldo) y los movimientos con
// columnas: Día · Mes · Oficina · Descripción · Doc. · Débito · Crédito.
//
// El estado NO trae el NIT/ID Origen (a diferencia del Excel de movimientos), así que
// el signo sale de la columna (Crédito = ingreso +, Débito = egreso −) y la factura,
// si aplica, se hereda por fecha+valor (fusión en el endpoint de carga).
//
// Corre en runtime Node (usa pdfjs-dist vía unpdf).

import { getDocumentProxy } from "unpdf";
import type { BankMovement } from "./parseBank";

export type ParsedDaviviendaPdf = {
  movements: BankMovement[];
  // Valores del bloque de saldos del extracto (autoridad para las tarjetas):
  saldoAnterior: number | null; // Saldo Anterior  -> Saldo inicial
  ingresos: number | null; // Más Créditos   -> Total ingresos
  egresos: number | null; // Menos Débitos  -> Total egresos
  saldoFinal: number | null; // Nuevo Saldo    -> Saldo actual
};

type Token = { text: string; x: number; y: number };

// Valores tipo "$ 922,446.00" o "$911,885,426.77" (con/sin espacio tras el $).
const MONEY_RE = /\$?\s*(-?[\d,]+\.\d{2})/;

// Límites X de columna (calibrados con el encabezado Fecha·Oficina·Descripción·Doc·Débito·Crédito).
const COL = {
  dia: [40, 63] as [number, number],
  mes: [63, 82] as [number, number],
  descripcion: [120, 350] as [number, number],
  documento: [350, 390] as [number, number],
  debito: [390, 505] as [number, number],
  credito: [505, 640] as [number, number],
};

const MESES_INFORME: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function toMoney(s: string): number {
  const m = s.match(MONEY_RE);
  if (!m) return NaN;
  return parseFloat(m[1].replace(/,/g, ""));
}

function inCol(x: number, [lo, hi]: [number, number]) {
  return x >= lo && x < hi;
}

function groupLines(tokens: Token[]): Token[][] {
  const anchors: number[] = [];
  const lineas = new Map<number, Token[]>();
  for (const t of tokens.sort((a, b) => b.y - a.y)) {
    let key = anchors.find((a) => Math.abs(a - t.y) <= 3);
    if (key === undefined) {
      anchors.push(t.y);
      key = t.y;
    }
    const arr = lineas.get(key) ?? [];
    arr.push(t);
    lineas.set(key, arr);
  }
  return [...lineas.values()].map((toks) => toks.sort((a, b) => a.x - b.x));
}

// Año del informe: "INFORME DEL MES: MAYO /2026" -> { year: 2026, month: 5 }.
function findInforme(lines: Token[][]): { year: number; month: number } | null {
  for (const toks of lines) {
    const text = toks.map((t) => t.text).join(" ");
    const m = text.match(/INFORME DEL MES:\s*([A-Za-záéíóú]+)\s*\/?\s*(\d{4})/i);
    if (m) {
      const month = MESES_INFORME[m[1].toLowerCase()] ?? 0;
      return { year: Number(m[2]), month };
    }
  }
  return null;
}

// Valor de una línea del bloque de saldos, según su etiqueta (ej. "Más Créditos").
// Toma el primer token de dinero a la derecha de la etiqueta (x > 150).
function findHeaderValue(lines: Token[][], label: RegExp): number | null {
  for (const toks of lines) {
    const text = toks.map((t) => t.text).join(" ");
    if (!label.test(text)) continue;
    const tok = toks.find((t) => t.x > 150 && MONEY_RE.test(t.text));
    if (tok) return toMoney(tok.text);
  }
  return null;
}

// Año para un mes dado (maneja el cruce dic↔ene respecto al mes del informe).
function yearForMonth(month: number, informe: { year: number; month: number }): number {
  if (informe.month === 1 && month === 12) return informe.year - 1;
  if (informe.month === 12 && month === 1) return informe.year + 1;
  return informe.year;
}

export async function parseBankDaviviendaPdf(data: Uint8Array): Promise<ParsedDaviviendaPdf> {
  const pdf = await getDocumentProxy(data);
  const lines: Token[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const tokens: Token[] = [];
    for (const item of content.items) {
      const it = item as { str?: string; transform?: number[] };
      if (!it.str || !it.str.trim() || !it.transform) continue;
      tokens.push({ text: it.str.trim(), x: it.transform[4], y: it.transform[5] });
    }
    lines.push(...groupLines(tokens));
  }

  const informe = findInforme(lines);
  const movements: BankMovement[] = [];

  for (const toks of lines) {
    // Una fila de movimiento empieza con Día (número) y Mes (número) en sus columnas.
    const diaTok = toks.find((t) => inCol(t.x, COL.dia) && /^\d{1,2}$/.test(t.text));
    const mesTok = toks.find((t) => inCol(t.x, COL.mes) && /^\d{1,2}$/.test(t.text));
    if (!diaTok || !mesTok) continue;

    const debTok = toks.find((t) => inCol(t.x, COL.debito) && MONEY_RE.test(t.text));
    const credTok = toks.find((t) => inCol(t.x, COL.credito) && MONEY_RE.test(t.text));
    const debito = debTok ? toMoney(debTok.text) : 0;
    const credito = credTok ? toMoney(credTok.text) : 0;
    if (!debTok && !credTok) continue;

    // Crédito = ingreso (+), Débito = egreso (−). Una fila trae uno de los dos.
    const valor = credito !== 0 ? credito : -debito;
    if (valor === 0) continue;

    const day = Number(diaTok.text);
    const month = Number(mesTok.text);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const year = informe ? yearForMonth(month, informe) : new Date().getFullYear();

    const desc = toks.filter((t) => inCol(t.x, COL.descripcion)).map((t) => t.text).join(" ").trim();
    const oficina = toks.filter((t) => t.x >= 82 && t.x < 120).map((t) => t.text).join(" ").trim();
    const documento = toks.filter((t) => inCol(t.x, COL.documento)).map((t) => t.text).join("").trim();

    movements.push({
      fecha: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      descripcion: desc,
      sucursal: oficina,
      ref1: "",
      ref2: "",
      documento,
      valor,
      billId: "", // el estado de cuenta no trae NIT/ID Origen
    });
  }

  return {
    movements,
    saldoAnterior: findHeaderValue(lines, /Saldo\s+Anterior/i),
    ingresos: findHeaderValue(lines, /m[aá]s\s+cr[eé]ditos/i),
    egresos: findHeaderValue(lines, /menos\s+d[eé]bitos/i),
    saldoFinal: findHeaderValue(lines, /nuevo\s+saldo/i),
  };
}
