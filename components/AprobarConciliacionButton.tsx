"use client";

import { CheckCircle2, Lock, Loader2, RotateCcw } from "lucide-react";
import { useCierre } from "./CierreContext";
import { fmtDate } from "@/lib/format";

// Botón/estado de aprobación del cierre, en el encabezado de la cuenta.
// - Sin aprobar: botón "Aprobar conciliación" (se habilita con datos + saldo inicial).
// - Aprobado: pastilla verde "Conciliación aprobada" + enlace "Reabrir".
export function AprobarConciliacionButton() {
  const { aprobado, aprobadoEn, aprobadoPor, canApprove, busy, approve, reopen } = useCierre();

  if (aprobado) {
    return (
      <div className="flex items-center gap-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-md bg-success/15 px-3 py-2 text-sm font-bold text-success"
          title={
            aprobadoEn
              ? `Aprobada el ${fmtDate(aprobadoEn)}${aprobadoPor ? ` por ${aprobadoPor}` : ""}`
              : undefined
          }
        >
          <CheckCircle2 className="h-4 w-4" />
          Conciliación aprobada
        </span>
        <button
          onClick={reopen}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink disabled:opacity-50"
        >
          {busy === "reopen" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Reabrir
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={approve}
      disabled={!canApprove || busy !== null}
      title={canApprove ? "Aprobar el cierre del mes" : "Digita el saldo inicial (y carga el extracto) para aprobar"}
      className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
      Aprobar conciliación
    </button>
  );
}
