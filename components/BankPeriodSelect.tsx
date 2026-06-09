"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function BankPeriodSelect({
  bankPeriods,
  current,
  billPeriod,
}: {
  bankPeriods: string[];
  current: string;
  billPeriod: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(value: string) {
    const params = new URLSearchParams();
    params.set("period", billPeriod);
    params.set("bankPeriod", value);
    startTransition(() => router.push(`/cartera?${params.toString()}`));
  }

  if (bankPeriods.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-soft">Mes de extracto</span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        className="h-9 rounded-md border border-line bg-white px-3 text-sm font-medium disabled:opacity-50"
      >
        {bankPeriods.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </label>
  );
}
