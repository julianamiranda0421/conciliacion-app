// Parser del extracto de Bancolombia (cuentas de recaudo). Soporta DOS formatos:
//
//  A) "Consulta de movimientos" (archivos CORTE): fecha YYYY/MM/DD y columnas
//     FECHA · DESCRIPCIÓN · SUCURSAL/CANAL · REFERENCIA 1 · REFERENCIA 2 · DOCUMENTO · VALOR.
//     REFERENCIA 1 trae la factura → conciliación por factura (nivel ALTO).
//
//  B) "Estado de cuenta" oficial: fecha D/MM (sin año) y columnas
//     FECHA · DESCRIPCIÓN · SUCURSAL · DCTO. · VALOR · SALDO.
//     NO trae factura (la conciliación cae a match por valor). El año se infiere del
//     encabezado "DESDE: aaaa/mm/dd  HASTA: aaaa/mm/dd". Trae todos los movimientos
//     del mes (ingresos y egresos), ideal para el cierre de saldos.
//
// Se agrupan los textos del PDF por línea (coordenada Y) y se reparten en columnas
// según su posición X. Corre en runtime Node (usa pdfjs-dist vía unpdf).

import { getDocumentProxy } from "unpdf";

export type BankMovement = {
  fecha: string; // YYYY-MM-DD
  descripcion: string;
  sucursal: string;
  ref1: string;
  ref2: string;
  documento: string;
  valor: number;
  billId: string; // ref1 sin ceros a la izquierda
};

type Token = { text: string; x: number; y: number };

const VALOR_RE = /^-?[\d,]+\.\d{2}$/;

// ---- Formato A: consulta de movimientos (YYYY/MM/DD + REFERENCIA 1/2) ----
const LEGACY_FECHA_RE = /^\d{4}\/\d{2}\/\d{2}$/;
const LEGACY_COLS: [keyof RawRow, number, number][] = [
  ["fecha", 0, 66],
  ["descripcion", 66, 236],
  ["sucursal", 236, 326],
  ["ref1", 326, 395],
  ["ref2", 395, 462],
  ["documento", 462, 521],
  ["valor", 521, 99999],
];

type RawRow = {
  fecha: string[];
  descripcion: string[];
  sucursal: string[];
  ref1: string[];
  ref2: string[];
  documento: string[];
  valor: string[];
};

function legacyColOf(x: number): keyof RawRow {
  for (const [name, lo, hi] of LEGACY_COLS) {
    if (x >= lo && x < hi) return name;
  }
  return "valor";
}

function parseLegacyLine(toks: Token[]): BankMovement | null {
  if (!toks.length || !LEGACY_FECHA_RE.test(toks[0].text)) return null;
  const b: RawRow = {
    fecha: [], descripcion: [], sucursal: [], ref1: [], ref2: [], documento: [], valor: [],
  };
  for (const t of toks) b[legacyColOf(t.x)].push(t.text);

  const valorTxt = b.valor.find((v) => VALOR_RE.test(v));
  if (!valorTxt) return null;

  const ref1 = b.ref1.join("").trim();
  return {
    fecha: b.fecha[0].replace(/\//g, "-"),
    descripcion: b.descripcion.join(" ").trim(),
    sucursal: b.sucursal.join(" ").trim(),
    ref1,
    ref2: b.ref2.join("").trim(),
    documento: b.documento.join("").trim(),
    valor: parseFloat(valorTxt.replace(/,/g, "")),
    billId: ref1.replace(/^0+/, ""),
  };
}

// ---- Formato B: estado de cuenta oficial (D/MM + VALOR + SALDO) ----
const ESTADO_FECHA_RE = /^(\d{1,2})\/(\d{2})$/;
// Límites X de columna del estado de cuenta (la clave es separar VALOR de SALDO).
const ESTADO_COLS = {
  descripcion: [66, 245] as [number, number],
  sucursal: [245, 348] as [number, number],
  documento: [348, 420] as [number, number],
  valor: [420, 505] as [number, number],
  // saldo: x >= 505 (saldo corrido, se ignora)
};

type Periodo = { year: number; month: number } | null;

// Busca "DESDE: aaaa/mm/dd" y "HASTA: aaaa/mm/dd" en las líneas para inferir el año.
function findPeriodo(lines: Token[][]): { desde: Periodo; hasta: Periodo } {
  let desde: Periodo = null;
  let hasta: Periodo = null;
  for (const toks of lines) {
    const text = toks.map((t) => t.text).join(" ");
    if (!desde) {
      const m = text.match(/DESDE:\s*(\d{4})\/(\d{2})\/\d{2}/);
      if (m) desde = { year: Number(m[1]), month: Number(m[2]) };
    }
    if (!hasta) {
      const m = text.match(/HASTA:\s*(\d{4})\/(\d{2})\/\d{2}/);
      if (m) hasta = { year: Number(m[1]), month: Number(m[2]) };
    }
    if (desde && hasta) break;
  }
  return { desde, hasta };
}

// Año para un mes dado, usando el rango DESDE/HASTA (maneja cruce de año dic→ene).
function yearForMonth(month: number, desde: Periodo, hasta: Periodo): number | null {
  if (desde && month === desde.month) return desde.year;
  if (hasta && month === hasta.month) return hasta.year;
  return hasta?.year ?? desde?.year ?? null;
}

function parseEstadoLine(toks: Token[], desde: Periodo, hasta: Periodo): BankMovement | null {
  if (!toks.length) return null;
  const fm = toks[0].text.match(ESTADO_FECHA_RE);
  if (!fm) return null;
  const day = Number(fm[1]);
  const month = Number(fm[2]);
  const year = yearForMonth(month, desde, hasta);
  if (!year || month < 1 || month > 12) return null;

  const inCol = (x: number, [lo, hi]: [number, number]) => x >= lo && x < hi;
  const desc: string[] = [];
  const suc: string[] = [];
  const doc: string[] = [];
  let valorTxt: string | undefined;
  for (const t of toks) {
    if (inCol(t.x, ESTADO_COLS.descripcion)) desc.push(t.text);
    else if (inCol(t.x, ESTADO_COLS.sucursal)) suc.push(t.text);
    else if (inCol(t.x, ESTADO_COLS.documento)) doc.push(t.text);
    else if (inCol(t.x, ESTADO_COLS.valor) && VALOR_RE.test(t.text) && valorTxt === undefined) {
      valorTxt = t.text;
    }
  }
  if (valorTxt === undefined) return null;

  return {
    fecha: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    descripcion: desc.join(" ").trim(),
    sucursal: suc.join(" ").trim(),
    ref1: "",
    ref2: "",
    documento: doc.join("").trim(),
    valor: parseFloat(valorTxt.replace(/,/g, "")),
    billId: "", // el estado de cuenta no trae factura
  };
}

// Extrae el "SALDO ANTERIOR" del bloque RESUMEN del estado de cuenta (saldo con el
// que abre el mes). Devuelve null si no aparece (formato CORTE o Davivienda).
function findSaldoAnterior(lines: Token[][]): number | null {
  for (const toks of lines) {
    const text = toks.map((t) => t.text).join(" ");
    if (!/SALDO\s+ANTERIOR/i.test(text)) continue;
    // El valor va junto a la etiqueta (x < 320); "SALDO PROMEDIO" (misma línea) no
    // trae decimales, así que VALOR_RE lo descarta de todos modos.
    const tok = toks.find((t) => t.x < 320 && VALOR_RE.test(t.text));
    if (tok) return parseFloat(tok.text.replace(/,/g, ""));
  }
  return null;
}

// Agrupa los tokens de una página en líneas por coordenada Y (con tolerancia).
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

export type ParsedBank = {
  movements: BankMovement[];
  // Saldo con el que abre el mes (solo lo trae el estado de cuenta oficial).
  saldoAnterior: number | null;
};

export async function parseBankPdf(data: Uint8Array): Promise<ParsedBank> {
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

  // Se corren ambos parsers y se devuelve el que reconozca más movimientos. Los
  // formatos son mutuamente excluyentes (distinto formato de fecha), así que el que
  // no aplica devuelve ~0 filas.
  const { desde, hasta } = findPeriodo(lines);
  const legacy: BankMovement[] = [];
  const estado: BankMovement[] = [];
  for (const toks of lines) {
    const l = parseLegacyLine(toks);
    if (l) legacy.push(l);
    if (desde || hasta) {
      const e = parseEstadoLine(toks, desde, hasta);
      if (e) estado.push(e);
    }
  }
  const esEstado = estado.length > legacy.length;
  return {
    movements: esEstado ? estado : legacy,
    saldoAnterior: esEstado ? findSaldoAnterior(lines) : null,
  };
}
