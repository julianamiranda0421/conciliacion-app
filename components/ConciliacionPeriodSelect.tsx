"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// Selector del mes de extracto en la vista de conciliación de una cuenta.
// Cambia el query param ?period= y refresca (la página recalcula en vivo).
export function ConciliacionPeriodSelect({
  accountId,
  periods,
  current,
}: {
  accountId: string;
  periods: string[];
  current: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(value: string) {
    const params = new URLSearchParams();
    params.set("period", value);
    startTransition(() =>
      router.push(`/conciliaciones/${accountId}?${params.toString()}`),
    );
  }

  if (periods.length <= 1) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-soft">Mes de extracto</span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        className="h-9 rounded-md border border-line bg-white px-3 text-sm font-medium disabled:opacity-50"
      >
        {periods.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </label>
  );
}
