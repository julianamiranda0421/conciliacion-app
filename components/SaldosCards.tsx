"use client";

import { useState } from "react";
import { Loader2, Check, HelpCircle } from "lucide-react";
import { useCierre } from "./CierreContext";
import { money, signClass } from "@/lib/format";

// Barra conectada del cierre del mes, mostrando la ecuación:
//   Saldo inicial  (+)  Total ingresos  (−)  Total egresos  (=)  Saldo actual
// Los operadores van en círculos sobre las divisiones. El Saldo inicial es editable
// (se autoguarda); las demás se calculan de los movimientos.
export function SaldosCards() {
  const { ingresos, egresos, saldoActual, saldoInicial, saldoInicialStr, setSaldoInicial, saveState } =
    useCierre();

  // Mientras se edita se muestra el número crudo; al salir se muestra formateado.
  const [editing, setEditing] = useState(false);
  const display = editing ? saldoInicialStr : saldoInicial == null ? "" : money(saldoInicial);

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[720px] items-stretch rounded-xl border border-line bg-white shadow-sm">
        {/* Saldo inicial (editable, autoguardado) */}
        <div className="flex-1 px-5 py-4">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-ink-soft">Saldo inicial</span>
            <span
              title="Saldo con el que abre el mes. Se llena del extracto (SALDO ANTERIOR) y lo puedes ajustar."
              className="cursor-help text-ink-soft/60"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </span>
            {saveState === "saving" && <Loader2 className="h-3 w-3 animate-spin text-ink-soft" />}
            {saveState === "saved" && <Check className="h-3 w-3 text-success" />}
            {saveState === "error" && <span className="text-[10px] font-medium text-error">no se guardó</span>}
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={display}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            onChange={(e) => setSaldoInicial(e.target.value.replace(/[^\d.-]/g, ""))}
            placeholder="$0"
            className="mt-1 w-full bg-transparent text-2xl font-bold tabular-nums text-ink outline-none placeholder:text-ink"
          />
        </div>

        <Op symbol="+" />
        <Segment label="Total ingresos" labelClass="text-success" value={money(ingresos)} />
        <Op symbol="−" />
        <Segment label="Total egresos" labelClass="text-error" value={money(egresos)} />
        <Op symbol="=" />
        <Segment
          label="Saldo actual"
          value={money(saldoActual)}
          valueClass={signClass(saldoActual) || "text-ink"}
        />
      </div>
    </div>
  );
}

function Segment({
  label,
  value,
  labelClass,
  valueClass,
}: {
  label: string;
  value: string;
  labelClass?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex-1 px-5 py-4">
      <div className={`text-sm font-medium ${labelClass ?? "text-ink-soft"}`}>{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${valueClass ?? "text-ink"}`}>{value}</div>
    </div>
  );
}

// Divisor vertical con el operador (+ − =) en un círculo centrado sobre la línea.
function Op({ symbol }: { symbol: string }) {
  return (
    <div className="relative w-px shrink-0 self-stretch bg-line">
      <span className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white text-sm font-medium text-ink-soft">
        {symbol}
      </span>
    </div>
  );
}
