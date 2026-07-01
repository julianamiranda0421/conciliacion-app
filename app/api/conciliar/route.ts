import { NextResponse } from "next/server";
import { parseBankPdf, type BankMovement } from "@/lib/parseBank";
import { parseBankDavivienda } from "@/lib/parseBankDavivienda";
import { parseBankDaviviendaPdf } from "@/lib/parseBankDaviviendaPdf";
import { filterForAccount } from "@/lib/parseTransactions";
import { reconcileForAccount } from "@/lib/reconcile";
import { getAccount } from "@/lib/banks";
import { computeMovTotals, saldoActual } from "@/lib/closing";
import { attachBills } from "@/lib/mergeBills";
import {
  getReconTransactions,
  saveBankMovements,
  saveCrossings,
  recordLoad,
  enrichConciliado,
  saveClosing,
  getMovementBills,
  saveMovementBills,
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

    // 1) Parsear el extracto del banco según el formato de la cuenta
    const account = getAccount(accountId);
    const name = bankFile.name.toLowerCase();
    const buf = new Uint8Array(await bankFile.arrayBuffer());
    const isPdf = name.endsWith(".pdf");
    const isExcel = /\.xlsx?$/.test(name);
    const esDavivienda = account?.bank === "Davivienda";
    let banco: BankMovement[];
    // Saldos del bloque de resumen del estado de cuenta (autoridad para las tarjetas).
    let saldoAnterior: number | null = null;
    let headerIngresos: number | null = null;
    let headerEgresos: number | null = null;
    let headerSaldoFinal: number | null = null;
    if (esDavivienda) {
      // Davivienda acepta el Excel de movimientos (trae NIT) o el estado de cuenta en
      // PDF (trae saldos; la factura/NIT se hereda por fecha+valor si aplica).
      if (isExcel) {
        banco = parseBankDavivienda(buf);
      } else if (isPdf) {
        const parsed = await parseBankDaviviendaPdf(buf);
        banco = parsed.movements;
        saldoAnterior = parsed.saldoAnterior;
        headerIngresos = parsed.ingresos;
        headerEgresos = parsed.egresos;
        headerSaldoFinal = parsed.saldoFinal;
      } else {
        return NextResponse.json(
          { error: "Esta cuenta espera el extracto en Excel (.xlsx) o el estado de cuenta en PDF." },
          { status: 400 },
        );
      }
    } else {
      // Bancolombia: PDF (consulta de movimientos o estado de cuenta oficial).
      if (!isPdf) {
        return NextResponse.json(
          { error: "Esta cuenta espera el extracto en PDF." },
          { status: 400 },
        );
      }
      const parsed = await parseBankPdf(buf);
      banco = parsed.movements;
      saldoAnterior = parsed.saldoAnterior;
    }

    // 2.a) Si no se pudo leer NINGÚN movimiento, no guardar en blanco: avisar. Suele
    //      pasar si cambia el formato/encabezados del Excel o la hoja está vacía.
    if (banco.length === 0) {
      return NextResponse.json(
        {
          error: isExcel
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

    // 2.c) Caso especial 7772 + estado de cuenta PDF: actualiza SOLO los saldos (cierre)
    //      y NO reemplaza los movimientos. El detalle por canal (Físico/TC/PSE) del 7772
    //      se sigue conciliando con el Excel; el PDF solo aporta los saldos del mes.
    const soloSaldos = accountId === "davivienda-7772" && isPdf;
    if (soloSaldos) {
      if (saldoAnterior == null) {
        return NextResponse.json(
          { error: "No se pudo leer el bloque de saldos del estado de cuenta. Verifica el archivo." },
          { status: 400 },
        );
      }
      const totals = computeMovTotals(banco);
      const ingresos = headerIngresos ?? totals.ingresos;
      const egresos = headerEgresos ?? totals.egresos;
      await saveClosing(periodo, accountId, {
        saldoInicial: saldoAnterior,
        ingresos,
        egresos,
        saldoFinal: headerSaldoFinal ?? saldoActual(saldoAnterior, { ingresos, egresos }),
      });
      await recordLoad(periodo, accountId, {
        cutoffDate: cutoff,
        filename: bankFile.name,
        rowCount: banco.length,
      });
      return NextResponse.json({ ok: true, soloSaldos: true });
    }

    // 2.d) Transactions del período desde bills_360 (Metabase) — para la conciliación.
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

    // 2.e) Fusión "el extracto no reemplaza, hereda". Si el archivo NO trae facturas
    //      (estado de cuenta oficial), cada movimiento hereda su factura del mapa
    //      persistido (cargas con factura / CORTE) por fecha+valor, para no perder la
    //      conciliación ya hecha. Si SÍ trae facturas, ese mapa se refresca al final.
    const hasFacturas = banco.some((m) => m.billId);
    if (!hasFacturas) {
      const pairs = await getMovementBills(periodo, accountId);
      banco = attachBills(banco, pairs);
    }

    // 3) Conciliar y persistir
    const result = reconcileForAccount(accountId, banco, txns, periodo);
    await saveBankMovements(periodo, accountId, banco);
    await saveCrossings(periodo, accountId, result.conciliado);

    // Refrescar el mapa factura↔movimiento cuando la carga trae facturas (CORTE), para
    // que un extracto posterior pueda heredarlas.
    if (hasFacturas) {
      await saveMovementBills(
        periodo,
        accountId,
        banco.filter((m) => m.billId).map((m) => ({ fecha: m.fecha, valor: m.valor, billId: m.billId })),
      );
    }
    await recordLoad(periodo, accountId, {
      cutoffDate: cutoff,
      filename: bankFile.name,
      rowCount: banco.length,
    });

    // Autollenado del saldo inicial desde el estado de cuenta (SALDO ANTERIOR). El
    // usuario lo puede ajustar luego. Defensivo: si la tabla recon_closing aún no
    // existe, no rompe la carga (el cierre simplemente queda sin prellenar).
    if (saldoAnterior != null) {
      try {
        // Preferir los totales DECLARADOS en el encabezado del extracto (más robustos
        // que sumar los movimientos, que puede variar por layout); si no vienen, sumar.
        const totals = computeMovTotals(banco);
        const ingresos = headerIngresos ?? totals.ingresos;
        const egresos = headerEgresos ?? totals.egresos;
        await saveClosing(periodo, accountId, {
          saldoInicial: saldoAnterior,
          ingresos,
          egresos,
          saldoFinal: headerSaldoFinal ?? saldoActual(saldoAnterior, { ingresos, egresos }),
        });
      } catch (e) {
        console.warn("Autollenado de saldo inicial omitido:", e instanceof Error ? e.message : e);
      }
    }

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
