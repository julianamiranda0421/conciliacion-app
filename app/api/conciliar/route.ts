import { NextResponse } from "next/server";
import { parseBankPdf } from "@/lib/parseBank";
import { parseBankDavivienda } from "@/lib/parseBankDavivienda";
import { filterForAccount } from "@/lib/parseTransactions";
import { reconcileForAccount } from "@/lib/reconcile";
import { getAccount } from "@/lib/banks";
import {
  getReconTransactions,
  saveBankMovements,
  saveCrossings,
  recordLoad,
  enrichConciliado,
} from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// "Junio 2026" -> "2026-06" (prefijo year-month). null si no parsea.
function periodoPrefix(periodo: string): string | null {
  const m = periodo.trim().toLowerCase().match(/([a-záéíóú]+)\s+(\d{4})/);
  if (!m) return null;
  const idx = MESES.findIndex((x) => x.toLowerCase() === m[1]);
  if (idx < 0) return null;
  return `${m[2]}-${String(idx + 1).padStart(2, "0")}`;
}

// "2026-06" -> "Junio 2026" (para mensajes).
function prefixLabel(prefix: string): string {
  const [y, mm] = prefix.split("-");
  return `${MESES[Number(mm) - 1] ?? mm} ${y}`;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const bankFile = form.get("bank");
    const periodo = String(form.get("periodo") ?? "");
    const accountId = String(form.get("accountId") ?? "");
    const cutoff = String(form.get("cutoff") ?? "");

    if (!(bankFile instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo del banco." }, { status: 400 });
    }
    if (!periodo || !accountId) {
      return NextResponse.json({ error: "Falta período o cuenta." }, { status: 400 });
    }

    // 1) Transactions del período desde bills_360 (Metabase). Ya NO se cargan a mano:
    //    se sincronizan desde Metabase en Cartera 360.
    const txnRows = await getReconTransactions(periodo);
    if (txnRows.length === 0) {
      return NextResponse.json(
        { error: `No hay pagos en bills_360 para ${periodo}. Sincroniza la cartera desde Metabase primero (Cartera 360).` },
        { status: 400 },
      );
    }
    const txns = filterForAccount(accountId, txnRows);
    if (txns.length === 0) {
      return NextResponse.json(
        { error: "No hay pagos que apliquen a esta cuenta en el período." },
        { status: 400 },
      );
    }

    // 2) Parsear el extracto del banco según el formato de la cuenta
    const account = getAccount(accountId);
    const name = bankFile.name.toLowerCase();
    const buf = new Uint8Array(await bankFile.arrayBuffer());
    let banco;
    if (account?.format === "excel") {
      if (!/\.xlsx?$/.test(name)) {
        return NextResponse.json(
          { error: "Esta cuenta espera el extracto en Excel (.xlsx)." },
          { status: 400 },
        );
      }
      banco = parseBankDavivienda(buf);
    } else {
      if (!name.endsWith(".pdf")) {
        return NextResponse.json(
          { error: "Esta cuenta espera el extracto en PDF." },
          { status: 400 },
        );
      }
      banco = await parseBankPdf(buf);
    }

    // 2.a) Si no se pudo leer NINGÚN movimiento, no guardar en blanco: avisar. Suele
    //      pasar si cambia el formato/encabezados del Excel o la hoja está vacía.
    if (banco.length === 0) {
      return NextResponse.json(
        {
          error:
            account?.format === "excel"
              ? "No se pudo leer ningún movimiento del extracto. Verifica que el Excel tenga los encabezados esperados (incluye 'Desc Mot.' y 'Valor Total') y que los datos no estén vacíos."
              : "No se pudo leer ningún movimiento del extracto (PDF). Verifica el archivo.",
        },
        { status: 400 },
      );
    }

    // 2.b) Validar que el extracto SÍ corresponda al mes seleccionado. Evita
    //      sobrescribir por error otro período (ej. subir el extracto de junio
    //      eligiendo "Mayo"). Si ningún movimiento cae en el mes elegido, se bloquea.
    const fechas = banco.map((m) => m.fecha).filter((f) => /^\d{4}-\d{2}/.test(f));
    const selPrefix = periodoPrefix(periodo);
    if (selPrefix && fechas.length > 0) {
      const presentes = [...new Set(fechas.map((f) => f.slice(0, 7)))];
      if (!presentes.includes(selPrefix)) {
        const detectados = presentes.map(prefixLabel).join(", ");
        return NextResponse.json(
          {
            error:
              `El extracto contiene movimientos de ${detectados}, pero seleccionaste ${periodo}. ` +
              `Verifica el mes para no sobrescribir otro período.`,
          },
          { status: 400 },
        );
      }
    }

    // 3) Conciliar y persistir
    const result = reconcileForAccount(accountId, banco, txns, periodo);
    await saveBankMovements(periodo, accountId, banco);
    await saveCrossings(periodo, accountId, result.conciliado);
    await recordLoad(periodo, accountId, {
      cutoffDate: cutoff,
      filename: bankFile.name,
      rowCount: banco.length,
    });

    // Enriquecer el conciliado (período/valor/status de factura) para el preview.
    result.conciliado = await enrichConciliado(result.conciliado, periodo, accountId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Error en conciliación:", err);
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json(
      { error: `No se pudo procesar la conciliación: ${msg}` },
      { status: 500 },
    );
  }
}
