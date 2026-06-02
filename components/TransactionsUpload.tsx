"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, X } from "lucide-react";
import { MONTHS } from "@/lib/banks";

const YEARS = [2025, 2026];

export function TransactionsUpload({ period }: { period: string; periods: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState("Mayo");
  const [file, setFile] = useState<File | null>(null);
  const [cutoff, setCutoff] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("periodo", `${month} ${year}`);
      fd.append("cutoff", cutoff);
      const res = await fetch("/api/transactions", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar");
      setOpen(false);
      setFile(null);
      router.push(`/transactions?period=${encodeURIComponent(`${month} ${year}`)}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary-hover"
      >
        <Upload className="h-4 w-4" />
        Cargar transactions
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-line bg-white p-4 shadow-sm sm:w-auto">
      <div className="mb-3 flex items-center justify-between gap-6">
        <span className="text-sm font-semibold">Cargar transactions del mes</span>
        <button onClick={() => setOpen(false)} className="text-ink-soft hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-10 rounded-md border border-line bg-white px-3 text-sm"
        >
          {YEARS.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-10 rounded-md border border-line bg-white px-3 text-sm"
        >
          {MONTHS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-soft">Fecha de corte</span>
          <input
            type="date"
            value={cutoff}
            onChange={(e) => setCutoff(e.target.value)}
            className="h-10 rounded-md border border-line bg-white px-3 text-sm"
          />
        </label>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line px-3 text-sm">
          <Upload className="h-4 w-4 text-primary" />
          <span className="max-w-[160px] truncate">{file ? file.name : "Elegir Excel"}</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          onClick={upload}
          disabled={!file || loading}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {loading ? "Cargando…" : "Cargar"}
        </button>
      </div>
      {error && <div className="mt-2 text-sm text-error">{error}</div>}
      <p className="mt-2 text-xs text-ink-soft">Reemplaza la base existente del período seleccionado.</p>
    </div>
  );
}
