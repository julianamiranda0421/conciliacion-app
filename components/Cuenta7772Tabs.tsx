"use client";

import { useState } from "react";
import { LayoutDashboard, Banknote, CreditCard, Globe } from "lucide-react";

// Sub-pestañas del 7772: resumen consolidado + un tab por canal de recaudo.
// Cada sección se renderiza en el servidor y se pasa como prop; aquí solo se alterna.
export function Cuenta7772Tabs({
  resumen,
  fisico,
  tc,
  pse,
}: {
  resumen: React.ReactNode;
  fisico: React.ReactNode;
  tc: React.ReactNode;
  pse: React.ReactNode;
}) {
  const [tab, setTab] = useState<"resumen" | "fisico" | "tc" | "pse">("resumen");
  const tabs = [
    { id: "resumen" as const, label: "Resumen 7772", icon: LayoutDashboard },
    { id: "fisico" as const, label: "Recaudo físico / cheque", icon: Banknote },
    { id: "tc" as const, label: "Tarjeta de crédito", icon: CreditCard },
    { id: "pse" as const, label: "PSE", icon: Globe },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-line">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-ink-soft hover:text-ink"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <div className={tab === "resumen" ? "" : "hidden"}>{resumen}</div>
        <div className={tab === "fisico" ? "" : "hidden"}>{fisico}</div>
        <div className={tab === "tc" ? "" : "hidden"}>{tc}</div>
        <div className={tab === "pse" ? "" : "hidden"}>{pse}</div>
      </div>
    </div>
  );
}
