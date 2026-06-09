"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw, Loader2 } from "lucide-react";

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function CarteraControls({
  periods,
  current,
  lastSync,
}: {
  periods: string[];
  current: string;
  lastSync: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPeriodChange(value: string) {
    startTransition(() => router.push(`/cartera?period=${encodeURIComponent(value)}`));
  }

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/bills-360", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al sincronizar");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-soft">Período</span>
          <select
            value={current}
            onChange={(e) => onPeriodChange(e.target.value)}
            disabled={pending}
            className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium disabled:opacity-50"
          >
            <option value="todos">Todos</option>
            {periods.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <button
          onClick={sync}
          disabled={syncing}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {syncing ? "Sincronizando…" : "Sincronizar"}
        </button>
      </div>
      {error && <span className="text-xs text-error">{error}</span>}
      <span className="text-xs text-ink-soft">Última sincronización: {fmtFecha(lastSync)}</span>
    </div>
  );
}
