"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Loader2, FileText, CheckCircle2, CircleDashed } from "lucide-react";

type Summary = {
  filas: number;
  conPago: number;
  sinPago: number;
  lastSync: string | null;
};

const nf = new Intl.NumberFormat("es-CO");

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function CarteraPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSummary() {
    try {
      const res = await fetch("/api/bills-360", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setSummary(data);
    } catch {
      /* el resumen es informativo; no rompe la página */
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  async function sync() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bills-360", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al sincronizar");
      setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cartera 360</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Facturas desde 2026 con su estado de pago, sincronizadas desde Metabase
            (&ldquo;Payments 360&rdquo;).
          </p>
        </div>
        <button
          onClick={sync}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {loading ? "Sincronizando…" : "Sincronizar desde Metabase"}
        </button>
      </div>

      {loading && (
        <p className="mb-4 text-sm text-ink-soft">
          Trayendo la cartera desde Metabase y guardándola en Supabase. Puede tardar varios
          segundos…
        </p>
      )}
      {error && (
        <div className="mb-4 rounded-md border border-error/30 bg-error/5 p-3 text-sm text-error">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card
          icon={<FileText className="h-5 w-5 text-primary" />}
          label="Filas (factura × pago)"
          value={summary ? nf.format(summary.filas) : "—"}
        />
        <Card
          icon={<CheckCircle2 className="h-5 w-5 text-success" />}
          label="Con pago registrado"
          value={summary ? nf.format(summary.conPago) : "—"}
        />
        <Card
          icon={<CircleDashed className="h-5 w-5 text-ink-soft" />}
          label="Sin pago"
          value={summary ? nf.format(summary.sinPago) : "—"}
        />
      </div>

      <p className="mt-4 text-xs text-ink-soft">
        Última sincronización: {fmtFecha(summary?.lastSync ?? null)}
      </p>
    </div>
  );
}

function Card({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-ink-soft">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
