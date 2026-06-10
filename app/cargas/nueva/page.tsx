"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Landmark,
  CheckCircle2,
  Lock,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { BANK_ACCOUNTS, MONTHS, type BankAccount } from "@/lib/banks";
import { Dashboard } from "@/components/Dashboard";
import type { ReconResult } from "@/lib/reconcile";

const YEARS = [2025, 2026];
const STEPS = ["Configurar", "Cargar archivo", "Confirmar"];

export default function NuevaCargaPage() {
  const [step, setStep] = useState(0);
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState("Mayo");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [cutoff, setCutoff] = useState("");
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconResult | null>(null);

  const account = BANK_ACCOUNTS.find((a) => a.id === accountId) ?? null;
  const canStep0 = !!account && account.enabled;
  const canStep1 = !!bankFile;

  async function runConciliacion() {
    if (!bankFile || !account) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("bank", bankFile);
      fd.append("accountId", account.id);
      fd.append("periodo", `${month} ${year}`);
      fd.append("cutoff", cutoff);
      const res = await fetch("/api/conciliar", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al conciliar");
      setResult(data as ReconResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al conciliar");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              Conciliación · {account?.bank} {account?.accountNumber}
            </h1>
            <p className="mt-1 text-sm text-ink-soft">
              {month} {year}
              {cutoff ? ` · corte ${cutoff}` : ""}
            </p>
          </div>
          <Link
            href="/cargas/nueva"
            onClick={() => {
              setResult(null);
              setStep(0);
              setBankFile(null);
            }}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-ink-soft transition hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Nueva carga
          </Link>
        </div>
        <div className="mt-6">
          <Dashboard result={result} accountId={account?.id ?? ""} period={`${month} ${year}`} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nueva carga</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Sigue los pasos para cargar los archivos de una cuenta y período.
          </p>
        </div>
        <Link
          href="/cargas"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-ink-soft transition hover:bg-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al historial
        </Link>
      </div>

      <Stepper step={step} />

      <div className="mt-6 rounded-xl border border-line bg-white p-6 shadow-sm">
        {step === 0 && (
          <ConfigStep
            year={year}
            month={month}
            setYear={setYear}
            setMonth={setMonth}
            cutoff={cutoff}
            setCutoff={setCutoff}
            accountId={accountId}
            setAccountId={setAccountId}
          />
        )}
        {step === 1 && <UploadStep bankFile={bankFile} setBankFile={setBankFile} />}
        {step === 2 && (
          <ConfirmStep
            account={account}
            year={year}
            month={month}
            bankFile={bankFile}
            error={error}
          />
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || loading}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-medium text-ink-soft transition enabled:hover:bg-white disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" />
          Atrás
        </button>

        {step < 2 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={(step === 0 && !canStep0) || (step === 1 && !canStep1)}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-40"
          >
            Siguiente
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={runConciliacion}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Conciliando…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Confirmar y conciliar
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="mt-6 flex items-center">
      {STEPS.map((label, i) => (
        <div key={label} className="flex flex-1 items-center last:flex-none">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                i <= step
                  ? "bg-primary text-white"
                  : "border border-line bg-white text-ink-soft"
              }`}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={`text-sm font-medium ${
                i <= step ? "text-ink" : "text-ink-soft"
              }`}
            >
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`mx-3 h-px flex-1 ${
                i < step ? "bg-primary" : "bg-line"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function ConfigStep({
  year,
  month,
  setYear,
  setMonth,
  cutoff,
  setCutoff,
  accountId,
  setAccountId,
}: {
  year: number;
  month: string;
  setYear: (y: number) => void;
  setMonth: (m: string) => void;
  cutoff: string;
  setCutoff: (d: string) => void;
  accountId: string | null;
  setAccountId: (id: string) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold">Período y corte</h2>
      <div className="mt-4 flex flex-wrap gap-4">
        <Field label="Año">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-10 w-40 rounded-md border border-line bg-white px-3 text-sm"
          >
            {YEARS.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </Field>
        <Field label="Mes">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 w-48 rounded-md border border-line bg-white px-3 text-sm"
          >
            {MONTHS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Fecha de corte">
          <input
            type="date"
            value={cutoff}
            onChange={(e) => setCutoff(e.target.value)}
            className="h-10 w-48 rounded-md border border-line bg-white px-3 text-sm"
          />
        </Field>
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        Puedes conciliar varias veces en el mes (varios cortes). Cada carga
        reemplaza la conciliación anterior del mes con los datos al corte indicado.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Cuenta bancaria</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {BANK_ACCOUNTS.map((a) => (
          <button
            key={a.id}
            disabled={!a.enabled}
            onClick={() => setAccountId(a.id)}
            className={`flex items-start gap-3 rounded-lg border p-4 text-left transition ${
              accountId === a.id
                ? "border-primary bg-primary-light"
                : "border-line bg-white hover:border-primary"
            } ${!a.enabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-surface text-primary">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {a.bank} {a.accountNumber}
                {!a.enabled && (
                  <span className="inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-soft">
                    <Lock className="h-3 w-3" /> Próximamente
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-ink-soft">{a.alias}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function UploadStep({
  bankFile,
  setBankFile,
}: {
  bankFile: File | null;
  setBankFile: (f: File | null) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold">Cargar extracto del banco</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Sube el extracto del banco. Bancolombia acepta <b>PDF</b> (se convierte
        solo) o <b>Excel</b>. Los pagos se toman automáticamente de la cartera
        sincronizada desde Metabase (Cartera 360); ya no se cargan a mano.
      </p>
      <div className="mt-5 grid gap-4 sm:max-w-md">
        <FileDrop
          icon={<FileText className="h-6 w-6" />}
          title="Extracto del banco (PDF o Excel)"
          accept=".pdf,.xlsx,.xls"
          file={bankFile}
          onFile={setBankFile}
        />
      </div>
    </div>
  );
}

function FileDrop({
  icon,
  title,
  accept,
  file,
  onFile,
}: {
  icon: React.ReactNode;
  title: string;
  accept: string;
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition ${
        file ? "border-success bg-success/5" : "border-line hover:border-primary"
      }`}
    >
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-lg ${
          file ? "bg-success/15 text-success" : "bg-surface text-primary"
        }`}
      >
        {file ? <CheckCircle2 className="h-6 w-6" /> : icon}
      </div>
      <div className="text-sm font-medium">{title}</div>
      <div className="max-w-[200px] truncate text-xs text-ink-soft">
        {file ? file.name : "Haz clic para seleccionar"}
      </div>
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function ConfirmStep({
  account,
  year,
  month,
  bankFile,
  error,
}: {
  account: BankAccount | null;
  year: number;
  month: string;
  bankFile: File | null;
  error: string | null;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold">Confirmar y conciliar</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Revisa los datos. Al confirmar, la app convierte el extracto y lo cruza
        contra los pagos del período sincronizados desde Metabase (Cartera 360).
      </p>
      <dl className="mt-5 divide-y divide-line rounded-lg border border-line">
        <Row label="Cuenta" value={account ? `${account.bank} ${account.accountNumber}` : "—"} />
        <Row label="Período" value={`${month} ${year}`} />
        <Row label="Extracto del banco" value={bankFile?.name ?? "—"} />
      </dl>
      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-error bg-error/5 px-4 py-3 text-sm text-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-ink-soft">{label}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="max-w-[60%] truncate text-sm font-medium">{value}</dd>
    </div>
  );
}
