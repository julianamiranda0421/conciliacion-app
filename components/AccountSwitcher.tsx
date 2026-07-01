"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Landmark, ChevronDown } from "lucide-react";
import { CONCILIABLE_ACCOUNTS } from "@/lib/banks";

// Selector de cuenta bancaria dentro de la vista de conciliación: cambia de cuenta
// sin volver a la lista general, conservando el mes seleccionado. Estilo pastilla.
export function AccountSwitcher({ current, period }: { current: string; period: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(id: string) {
    const params = new URLSearchParams({ period });
    startTransition(() => router.push(`/conciliaciones/${id}?${params.toString()}`));
  }

  const options = CONCILIABLE_ACCOUNTS.filter((a) => a.enabled);

  return (
    <div className="relative inline-flex items-center">
      <Landmark className="pointer-events-none absolute left-3 h-4 w-4 text-primary" />
      <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-ink-soft" />
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        aria-label="Cuenta bancaria"
        className="h-10 cursor-pointer appearance-none rounded-full border border-line bg-primary-light/40 pl-9 pr-8 text-sm font-semibold text-ink transition hover:border-primary disabled:opacity-50"
      >
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.bank} {a.accountNumber}
          </option>
        ))}
      </select>
    </div>
  );
}
