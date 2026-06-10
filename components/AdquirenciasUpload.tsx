"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

// Carga (aparte) del archivo de adquirencias TC para el período en curso.
export function AdquirenciasUpload({ period }: { period: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function subir() {
    if (!file) return;
    setLoading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("periodo", period);
      const res = await fetch("/api/adquirencias", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar");
      setMsg({ ok: true, text: `${data.count} adquirencias cargadas para ${period}.` });
      setFile(null);
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Error al cargar" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm hover:border-primary">
        <Upload className="h-4 w-4 text-primary" />
        <span className="max-w-[220px] truncate">{file ? file.name : "Elegir archivo de adquirencias (.xlsx)"}</span>
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <button
        onClick={subir}
        disabled={!file || loading}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-40"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Cargar adquirencias
      </button>
      {msg && (
        <span className={`inline-flex items-center gap-1.5 text-sm ${msg.ok ? "text-success" : "text-error"}`}>
          {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </span>
      )}
    </div>
  );
}
