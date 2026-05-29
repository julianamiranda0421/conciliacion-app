import Link from "next/link";
import { Plus, Inbox } from "lucide-react";

export default function CargasPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cargas</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Historial de archivos cargados al sistema por cuenta y período.
          </p>
        </div>
        <Link
          href="/cargas/nueva"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" />
          Nueva carga
        </Link>
      </div>

      <div className="mt-6 rounded-xl border border-line bg-white shadow-sm">
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-ink-soft">
            <Inbox className="h-6 w-6" />
          </div>
          <div className="text-sm font-medium">Aún no hay cargas registradas</div>
          <p className="max-w-sm text-sm text-ink-soft">
            Crea tu primera carga para subir el extracto del banco y la base de
            transactions del mes.
          </p>
          <Link
            href="/cargas/nueva"
            className="mt-2 inline-flex h-10 items-center gap-2 rounded-md border border-primary px-4 text-sm font-medium text-primary transition hover:bg-primary-light"
          >
            <Plus className="h-4 w-4" />
            Nueva carga
          </Link>
        </div>
      </div>
    </div>
  );
}
