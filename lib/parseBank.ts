// Parser del extracto PDF de Bancolombia (cuenta de recaudo).
// Replica la lógica de parse_banco.py: agrupa los textos del PDF por línea
// (coordenada Y) y los reparte en columnas según su posición X.
//
// Corre en el runtime Node de Vercel (no edge) por usar pdfjs-dist.

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

// Límites X de columna calibrados con el header del extracto (en puntos PDF).
const COLS: [keyof RawRow, number, number][] = [
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

const FECHA_RE = /^\d{4}\/\d{2}\/\d{2}$/;
const VALOR_RE = /^-?[\d,]+\.\d{2}$/;

function colOf(x: number): keyof RawRow {
  for (const [name, lo, hi] of COLS) {
    if (x >= lo && x < hi) return name;
  }
  return "valor";
}

type Token = { text: string; x: number; y: number };

export async function parseBankPdf(data: Uint8Array): Promise<BankMovement[]> {
  const pdf = await getDocumentProxy(data);

  const movimientos: BankMovement[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    const tokens: Token[] = [];
    for (const item of content.items) {
      // item es TextItem: { str, transform: [a,b,c,d,e,f] }
      const it = item as { str?: string; transform?: number[] };
      if (!it.str || !it.str.trim() || !it.transform) continue;
      tokens.push({ text: it.str.trim(), x: it.transform[4], y: it.transform[5] });
    }

    // Agrupar por línea (Y) con tolerancia, igual que en Python.
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

    for (const toks of lineas.values()) {
      toks.sort((a, b) => a.x - b.x);
      if (!toks.length || !FECHA_RE.test(toks[0].text)) continue;

      const b: RawRow = {
        fecha: [], descripcion: [], sucursal: [],
        ref1: [], ref2: [], documento: [], valor: [],
      };
      for (const t of toks) b[colOf(t.x)].push(t.text);

      const valorTxt = b.valor.find((v) => VALOR_RE.test(v));
      if (!valorTxt) continue;

      const ref1 = b.ref1.join("").trim();
      movimientos.push({
        fecha: b.fecha[0].replace(/\//g, "-"),
        descripcion: b.descripcion.join(" ").trim(),
        sucursal: b.sucursal.join(" ").trim(),
        ref1,
        ref2: b.ref2.join("").trim(),
        documento: b.documento.join("").trim(),
        valor: parseFloat(valorTxt.replace(/,/g, "")),
        billId: ref1.replace(/^0+/, ""),
      });
    }
  }

  return movimientos;
}
