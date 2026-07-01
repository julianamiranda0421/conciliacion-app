"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CalendarDays } from "lucide-react";
import { MONTHS } from "@/lib/banks";

// "Junio 2026" -> "2026-06" (valor que entiende <input type="month">).
function periodToMonthValue(period: string): string {
  const parts = period.trim().split(/\s+/);
  if (parts.length !== 2) return "";
  const idx = MONTHS.findIndex((m) => m.toLowerCase() === parts[0].toLowerCase());
  const year = Number(parts[1]);
  if (idx < 0 || !year) return "";
  return `${year}-${String(idx + 1).padStart(2, "0")}`;
}

// "2026-06" -> "Junio 2026".
function monthValueToPeriod(value: string): string | null {
  const m = value.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return null;
  return `${MONTHS[idx]} ${Number(m[1])}`;
}

// Selector del mes en la vista GENERAL de conciliaciones. Es un calendario
// (type=month): puedes elegir cualquier mes, tenga o no datos. Cambia el query
// param ?period= de /conciliaciones; los enlaces "Ver Conciliación" heredan el
// mes elegido. Si el mes no tiene extracto, la vista de la cuenta muestra vacío.
export function GeneralPeriodSelect({ current }: { current: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const value = periodToMonthValue(current);

  function onChange(v: string) {
    const period = monthValueToPeriod(v);
    if (!period) return;
    const params = new URLSearchParams({ period });
    startTransition(() => router.push(`/conciliaciones?${params.toString()}`));
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-soft">Mes</span>
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        <input
          type="month"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={pending}
          className="h-9 rounded-md border border-line bg-white pl-9 pr-3 text-sm font-medium disabled:opacity-50"
        />
      </div>
    </label>
  );
}
