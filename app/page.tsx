import Link from "next/link";
import { Wallet, Scale, ArrowRight } from "lucide-react";
import { BANK_ACCOUNTS } from "@/lib/banks";

export default function Home() {
  const habilitadas = BANK_ACCOUNTS.filter((a) => a.enabled).length;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold">Inicio</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Conciliación bancaria 360: cruza los movimientos del banco contra la base
        de transactions, cuenta por cuenta.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Cuentas configuradas" value={BANK_ACCOUNTS.length} />
        <Stat label="Cuentas habilitadas" value={habilitadas} />
        <Stat label="Período activo" value="Mayo 2026" />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <ModuleCard
          href="/conciliaciones"
          icon={<Scale className="h-5 w-5" />}
          title="Conciliaciones"
          desc="Carga el extracto del banco, adquirencias o PSE y concilia cada cuenta contra los pagos del período."
          cta="Ir a conciliaciones"
        />
        <ModuleCard
          href="/cartera"
          icon={<Wallet className="h-5 w-5" />}
          title="Cartera 360"
          desc="Consulta los pagos sincronizados desde Metabase que alimentan la conciliación."
          cta="Ir a cartera 360"
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function ModuleCard({
  href,
  icon,
  title,
  desc,
  cta,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-line bg-white p-6 shadow-sm transition hover:border-primary hover:shadow-md"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light text-primary">
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{desc}</p>
      <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
        {cta}
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
