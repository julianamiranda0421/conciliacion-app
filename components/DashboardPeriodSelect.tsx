"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CalendarDays } from "lucide-react";
import { MONTHS } from "@/lib/banks";

// "Junio 2026" -> "2026-06".
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

// Selector de período del dashboard de Inicio. Calendario (type=month) → /?period=.
export function DashboardPeriodSelect({ current }: { current: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const value = periodToMonthValue(current);

  function onChange(v: string) {
    const period = monthValueToPeriod(v);
    if (!period) return;
    const params = new URLSearchParams({ period });
    startTransition(() => router.push(`/?${params.toString()}`));
  }

  return (
    <div className="relative inline-flex items-center">
      <CalendarDays className="pointer-events-none absolute left-3 h-4 w-4 text-primary" />
      <input
        type="month"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        aria-label="Período"
        className="h-10 cursor-pointer rounded-full border border-line bg-white pl-9 pr-3 text-sm font-semibold text-ink transition hover:border-primary disabled:opacity-50"
      />
    </div>
  );
}
