"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  X,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
} from "lucide-react";
import { MONTHS, CONCILIABLE_ACCOUNTS } from "@/lib/banks";

// Botón + modal para cargar, desde la vista de Conciliaciones, cualquier insumo
// de conciliación. El desplegable ofrece las cuentas bancarias (extracto) y los
// recursos que alimentan al Davivienda 7772: Adquirencias y Transacciones ACH (PSE).
//
// Flujo en dos pasos:
//  1) Configurar: cuenta/recurso, mes (calendario), fecha de corte y archivo.
//  2) Revisar: confirma los datos y dispara la carga al endpoint que corresponda.

type Kind = "extract" | "adquirencias" | "pse";

// Cuentas con extracto bancario propio (excluye adquirencias/PSE).
const BANK_OPTIONS = CONCILIABLE_ACCOUNTS.filter((a) => a.enabled).map((a) => ({
  id: a.id,
  label: `${a.bank} ${a.accountNumber}`.trim(),
}));

const RESOURCE_LABELS: Record<string, string> = {
  adquirencias: "Adquirencias",
  pse: "Transacciones ACH (PSE)",
};

function kindOf(id: string): Kind {
  if (id === "adquirencias") return "adquirencias";
  if (id === "pse") return "pse";
  return "extract";
}

function labelOf(id: string): string {
  return RESOURCE_LABELS[id] ?? BANK_OPTIONS.find((o) => o.id === id)?.label ?? "—";
}

// Config por tipo: etiqueta/accept del archivo, texto de revisión y etiqueta de la fila.
const KIND_CFG: Record<
  Kind,
  { fileLabel: string; accept: string; hint: string; review: string; rowLabel: string }
> = {
  extract: {
    fileLabel: "Extracto del banco (PDF o Excel)",
    accept: ".pdf,.xlsx,.xls",
    hint: "PDF o Excel (.pdf, .xlsx, .xls)",
    review:
      "Revisa los datos a cargar. Al confirmar, la app transcribe el extracto y lo cruza contra los pagos del período sincronizados desde Cartera 360. Si ya había una conciliación para este mes, se reemplaza con los datos al corte indicado.",
    rowLabel: "Cuenta",
  },
  adquirencias: {
    fileLabel: "Archivo de adquirencias (.xlsx)",
    accept: ".xlsx,.xls",
    hint: "Excel (.xlsx, .xls)",
    review:
      "Revisa los datos a cargar. Al confirmar, se guarda el archivo de adquirencias del período (reemplaza el anterior) y el cruce por tarjeta de crédito se recalcula en la conciliación del Davivienda 7772.",
    rowLabel: "Recurso",
  },
  pse: {
    fileLabel: "Archivo de PSE / Transacciones ACH (.xlsx)",
    accept: ".xlsx,.xls",
    hint: "Excel (.xlsx, .xls)",
    review:
      "Revisa los datos a cargar. Al confirmar, se guarda el archivo de PSE del período (reemplaza el anterior) y queda disponible en la pestaña PSE de la conciliación del Davivienda 7772.",
    rowLabel: "Recurso",
  },
};

// "2026-05" -> { period: "Mayo 2026" }. Devuelve null si no parsea.
function monthValueToPeriod(value: string): { period: string } | null {
  const m = value.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return null;
  return { period: `${MONTHS[idx]} ${Number(m[1])}` };
}

const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function formatCorte(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  const [, y, mm, dd] = m;
  return `${Number(dd)} de ${MESES_LARGOS[Number(mm) - 1] ?? mm} del ${y}`;
}

export function CargarExtractoModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modalStep, setModalStep] = useState<1 | 2>(1);
  const [accountId, setAccountId] = useState("");
  const [monthValue, setMonthValue] = useState(""); // "YYYY-MM"
  const [cutoff, setCutoff] = useState(""); // "YYYY-MM-DD"
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const periodInfo = monthValueToPeriod(monthValue);
  const kind = kindOf(accountId);
  const cfg = KIND_CFG[kind];
  const canContinue = !!accountId && !!periodInfo && !!file;

  function reset() {
    setModalStep(1);
    setAccountId("");
    setMonthValue("");
    setCutoff("");
    setFile(null);
    setLoading(false);
    setError(null);
  }

  function close() {
    if (loading) return;
    setOpen(false);
    reset();
  }

  async function runCarga() {
    if (!file || !periodInfo || !accountId) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("periodo", periodInfo.period);
      fd.append("cutoff", cutoff);

      let endpoint: string;
      let target: string; // a dónde navegar tras cargar
      if (kind === "extract") {
        fd.append("bank", file);
        fd.append("accountId", accountId);
        endpoint = "/api/conciliar";
        target = `/conciliaciones/${accountId}`;
      } else {
        fd.append("file", file);
        endpoint = kind === "adquirencias" ? "/api/adquirencias" : "/api/pse";
        // Adquirencias y PSE alimentan la conciliación del 7772.
        target = "/conciliaciones/davivienda-7772";
      }

      const res = await fetch(endpoint, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al procesar la carga");

      const params = new URLSearchParams({ period: periodInfo.period });
      setOpen(false);
      reset();
      router.push(`${target}?${params.toString()}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al procesar la carga");
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary-hover"
      >
        <Upload className="h-4 w-4 shrink-0" />
        Cargar extracto bancario
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={close}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Encabezado */}
            <div className="flex items-start justify-between border-b border-line px-6 py-4">
              <div>
                <h3 className="text-base font-bold">
                  {modalStep === 1 ? "Cargar extracto bancario" : "Revisar los datos a cargar"}
                </h3>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {modalStep === 2 && accountId
                    ? labelOf(accountId)
                    : "Selecciona la cuenta o recurso, el mes y el archivo"}
                </p>
              </div>
              <button
                onClick={close}
                disabled={loading}
                className="rounded-md p-1 text-ink-soft transition hover:bg-surface hover:text-ink disabled:opacity-40"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cuerpo */}
            <div className="px-6 py-5">
              {modalStep === 1 ? (
                <div className="grid gap-4">
                  <Field label="Cuenta o recurso">
                    <select
                      value={accountId}
                      onChange={(e) => {
                        setAccountId(e.target.value);
                        // Cambiar de tipo puede invalidar el archivo (PDF vs Excel).
                        setFile(null);
                      }}
                      className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm"
                    >
                      <option value="" disabled>
                        Selecciona una cuenta o recurso…
                      </option>
                      <optgroup label="Cuentas bancarias">
                        {BANK_OPTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Otros recursos (Davivienda 7772)">
                        <option value="adquirencias">Adquirencias</option>
                        <option value="pse">Transacciones ACH (PSE)</option>
                      </optgroup>
                    </select>
                  </Field>

                  <Field label="Mes del extracto">
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
                      <input
                        type="month"
                        value={monthValue}
                        onChange={(e) => setMonthValue(e.target.value)}
                        className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm"
                      />
                    </div>
                  </Field>

                  <Field label="Fecha de corte">
                    <input
                      type="date"
                      value={cutoff}
                      onChange={(e) => setCutoff(e.target.value)}
                      className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm"
                    />
                  </Field>

                  <Field label={cfg.fileLabel}>
                    <FileDrop file={file} onFile={setFile} accept={cfg.accept} hint={cfg.hint} />
                  </Field>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-ink-soft">{cfg.review}</p>
                  <dl className="mt-4 divide-y divide-line rounded-lg border border-line">
                    <Row label={cfg.rowLabel} value={labelOf(accountId)} />
                    <Row label="Período" value={periodInfo?.period ?? "—"} />
                    <Row label="Fecha de corte" value={cutoff ? formatCorte(cutoff) : "Sin corte"} />
                    <Row label="Archivo" value={file?.name ?? "—"} />
                  </dl>
                  {error && (
                    <div className="mt-4 flex items-center gap-2 rounded-md border border-error bg-error/5 px-4 py-3 text-sm text-error">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pie */}
            <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
              {modalStep === 1 ? (
                <>
                  <button
                    onClick={close}
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-medium text-ink-soft transition hover:bg-surface"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => setModalStep(2)}
                    disabled={!canContinue}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-40"
                  >
                    Continuar
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setModalStep(1)}
                    disabled={loading}
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-medium text-ink-soft transition hover:bg-surface disabled:opacity-40"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Atrás
                  </button>
                  <button
                    onClick={runCarga}
                    disabled={loading}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cargando…
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Cargar
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FileDrop({
  file,
  onFile,
  accept,
  hint,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  accept: string;
  hint: string;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition ${
        file ? "border-success bg-success/5" : "border-line hover:border-primary"
      }`}
    >
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-lg ${
          file ? "bg-success/15 text-success" : "bg-surface text-primary"
        }`}
      >
        {file ? <CheckCircle2 className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
      </div>
      <div className="max-w-[260px] truncate text-sm font-medium">
        {file ? file.name : "Haz clic para seleccionar el archivo"}
      </div>
      <div className="text-xs text-ink-soft">{hint}</div>
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </label>
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
