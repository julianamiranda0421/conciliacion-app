// Parser del archivo de recaudo PSE del 7772 ("Transacciones ACH").
// Cada fila es una transacción PSE (débito en cuenta del cliente) abonada al
// Davivienda 7772. Por ahora solo se parsea y se muestra el detalle (sin cruce).
// Los encabezados traen tildes/puntuación, así que se emparejan por nombre
// normalizado (sin acentos ni signos) para que el parser no se rompa.

import * as XLSX from "xlsx";

export type PseRow = {
  cus: string; // Código Único de Seguimiento (llave de la transacción PSE)
  fecha: string; // YYYY-MM-DD (Fecha-Hora creada)
  hora: string; // HH:MM:SS
  valor: number; // valor recaudado (pesos)
  bancoOriginador: string; // banco del pagador
  pagador: string; // Referencia 1 (NIT/CC del pagador)
  tipoUsuario: string; // Jurídico / Natural
  estado: string; // Aprobada / ...
  medioPago: string;
  codAutorizacion: string;
  ticketId: string;
  servicio: string; // Servicio Nombre
  cuentaDestino: string; // Número de Cuenta Destino (482800037772 = 7772)
};

// Normaliza un encabezado: sin tildes, sin signos, minúsculas, espacios colapsados.
function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

// "04/05/2026 08:33:32" -> { fecha: "2026-05-04", hora: "08:33:32" }
function splitFechaHora(v: unknown): { fecha: string; hora: string } {
  if (v instanceof Date) return { fecha: v.toISOString().slice(0, 10), hora: v.toISOString().slice(11, 19) };
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/);
  if (m) return { fecha: `${m[3]}-${m[2]}-${m[1]}`, hora: m[4] ?? "" };
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return { fecha: s.slice(0, 10), hora: s.slice(11, 19) };
  return { fecha: "", hora: "" };
}

const num = (v: unknown): number => {
  if (typeof v === "number") return v;
  // Por si viene como texto "1.234.567,89" (formato CO).
  const s = String(v ?? "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export function parsePse(data: Uint8Array): PseRow[] {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  if (rows.length < 2) return [];

  const head = (rows[0] as unknown[]).map(norm);
  const col = (name: string) => head.indexOf(name);
  const colStarts = (prefix: string) => head.findIndex((h) => h.startsWith(prefix));

  const iCus = col("cus");
  const iValor = col("valor");
  const iBanco = col("banco originador");
  const iEstado = col("estado");
  const iCod = colStarts("cod de autorizacion");
  const iFecha = col("fecha hora creada");
  const iTicket = col("ticket id");
  const iServicio = col("servicio nombre");
  const iRef1 = col("referencia 1");
  const iTipoUsuario = col("tipo de usuario");
  const iMedio = col("medio de pago");
  const iDestino = col("numero de cuenta destino");

  const get = (row: unknown[], i: number) => (i >= 0 ? row[i] : undefined);

  const out: PseRow[] = [];
  for (const raw of rows.slice(1)) {
    const row = raw as unknown[];
    const cus = String(get(row, iCus) ?? "").trim();
    const valor = num(get(row, iValor));
    if (!cus && valor <= 0) continue; // filas vacías / totales
    const { fecha, hora } = splitFechaHora(get(row, iFecha));
    out.push({
      cus,
      fecha,
      hora,
      valor,
      bancoOriginador: String(get(row, iBanco) ?? "").trim(),
      pagador: String(get(row, iRef1) ?? "").trim(),
      tipoUsuario: String(get(row, iTipoUsuario) ?? "").trim(),
      estado: String(get(row, iEstado) ?? "").trim(),
      medioPago: String(get(row, iMedio) ?? "").trim(),
      codAutorizacion: String(get(row, iCod) ?? "").trim(),
      ticketId: String(get(row, iTicket) ?? "").trim(),
      servicio: String(get(row, iServicio) ?? "").trim(),
      cuentaDestino: String(get(row, iDestino) ?? "").trim(),
    });
  }
  return out;
}
