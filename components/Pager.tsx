"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

// Paginador presentacional (Anterior / Siguiente + "Página X de Y" + rango). No se
// muestra si hay una sola página. Mismo estilo que el del detalle de conciliación.
export function Pager({
  page,
  totalPages,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onChange: (p: number) => void;
}) {
  if (total <= pageSize) return null;
  const btn =
    "inline-flex h-9 items-center gap-1 rounded-md border border-line bg-white px-3 font-medium transition hover:border-primary hover:text-primary disabled:opacity-40";
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft">
      <span>
        Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
      </span>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1} className={btn}>
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </button>
        <span className="tabular-nums">Página {page} de {totalPages}</span>
        <button onClick={() => onChange(page + 1)} disabled={page >= totalPages} className={btn}>
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
