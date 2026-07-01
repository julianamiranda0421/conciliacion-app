"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saldoActual as calcSaldoActual } from "@/lib/closing";
import type { ClosingRow } from "@/lib/db";

// Estado compartido del cierre del mes para una cuenta/período. Lo consumen:
//  - La tarjeta "Saldo inicial" (editable, se autoguarda).
//  - Las tarjetas "Total ingresos / egresos / Saldo actual" (calculadas).
//  - El botón "Aprobar conciliación" del encabezado.
// Todo bajo un mismo Provider que envuelve encabezado y cuerpo de la página.

export type SaveState = "idle" | "saving" | "saved" | "error";

type CierreCtx = {
  period: string;
  accountId: string;
  hasData: boolean;
  ingresos: number; // Σ movimientos positivos (del servidor)
  egresos: number; // Σ |movimientos negativos| (del servidor)
  saldoActual: number; // saldo inicial (o 0) + ingresos − egresos
  saldoInicialStr: string;
  saldoInicial: number | null;
  setSaldoInicial: (s: string) => void;
  saveState: SaveState;
  aprobado: boolean;
  aprobadoPor: string | null;
  aprobadoEn: string | null;
  canApprove: boolean;
  busy: null | "approve" | "reopen";
  error: string | null;
  approve: () => Promise<void>;
  reopen: () => Promise<void>;
};

const Ctx = createContext<CierreCtx | null>(null);

export function useCierre(): CierreCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCierre debe usarse dentro de <CierreProvider>");
  return v;
}

function parseNum(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function CierreProvider({
  period,
  accountId,
  hasData,
  ingresos,
  egresos,
  initial,
  children,
}: {
  period: string;
  accountId: string;
  hasData: boolean;
  ingresos: number;
  egresos: number;
  initial: ClosingRow | null;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const [saldoInicialStr, setSaldoInicialStr] = useState(
    initial?.saldo_inicial == null ? "" : String(initial.saldo_inicial),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [aprobado, setAprobado] = useState(!!initial?.aprobado);
  const [aprobadoPor, setAprobadoPor] = useState(initial?.aprobado_por ?? null);
  const [aprobadoEn, setAprobadoEn] = useState(initial?.aprobado_en ?? null);
  const [busy, setBusy] = useState<null | "approve" | "reopen">(null);
  const [error, setError] = useState<string | null>(null);

  const saldoInicial = parseNum(saldoInicialStr);
  const saldoActual = calcSaldoActual(saldoInicial, { ingresos, egresos });
  const canApprove = hasData && saldoInicial != null && !aprobado;

  const lastSaved = useRef(saldoInicialStr);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpia el debounce pendiente al desmontar.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Autoguardado del saldo inicial: se dispara desde el onChange del input (no en un
  // effect). Editar un mes aprobado lo reabre (el server pone aprobado=false), así no
  // queda "aprobado" con un saldo distinto al validado.
  function setSaldoInicial(v: string) {
    setSaldoInicialStr(v);
    if (timer.current) clearTimeout(timer.current);
    if (v === lastSaved.current) {
      setSaveState("idle");
      return;
    }
    if (aprobado) setAprobado(false); // optimista: editar reabre
    setSaveState("saving");
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/closing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ period, accountId, action: "save", saldoInicial: parseNum(v) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
        lastSaved.current = v;
        const c = data.closing as ClosingRow | null;
        setAprobado(!!c?.aprobado);
        setAprobadoPor(c?.aprobado_por ?? null);
        setAprobadoEn(c?.aprobado_en ?? null);
        setSaveState("saved");
        setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1600);
      } catch {
        setSaveState("error");
      }
    }, 700);
  }

  async function call(action: "approve" | "reopen") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, accountId, action, saldoInicial }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo completar la acción");
      const c = data.closing as ClosingRow | null;
      setAprobado(!!c?.aprobado);
      setAprobadoPor(c?.aprobado_por ?? null);
      setAprobadoEn(c?.aprobado_en ?? null);
      lastSaved.current = saldoInicialStr;
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la acción");
    } finally {
      setBusy(null);
    }
  }

  const value: CierreCtx = {
    period,
    accountId,
    hasData,
    ingresos,
    egresos,
    saldoActual,
    saldoInicialStr,
    saldoInicial,
    setSaldoInicial,
    saveState,
    aprobado,
    aprobadoPor,
    aprobadoEn,
    canApprove,
    busy,
    error,
    approve: () => call("approve"),
    reopen: () => call("reopen"),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
