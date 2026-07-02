"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Scale, Zap, Wallet, PanelLeftClose, PanelLeftOpen } from "lucide-react";

const NAV = [
  { href: "/", label: "Torre de Control", icon: LayoutDashboard },
  { href: "/cartera", label: "Cartera 360", icon: Wallet },
  { href: "/conciliaciones", label: "Conciliaciones", icon: Scale },
];

export function Sidebar() {
  const pathname = usePathname();
  // Panel fijado (expandido) o desfijado (colapsado a solo íconos). El estado vive en
  // el layout (persiste entre navegaciones del cliente).
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`hidden shrink-0 flex-col border-r border-line bg-white transition-[width] duration-200 md:flex ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Encabezado: marca (expandido) + botón fijar/desfijar */}
      <div
        className={`flex items-center border-b border-line py-5 ${
          collapsed ? "justify-center px-2" : "justify-between px-5"
        }`}
      >
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">bia</div>
              <div className="text-xs text-ink-soft">Conciliación Bancaria</div>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="rounded-md p-1.5 text-ink-soft transition hover:bg-surface hover:text-ink"
          title={collapsed ? "Fijar panel" : "Desfijar panel"}
          aria-label={collapsed ? "Fijar panel lateral" : "Desfijar panel lateral"}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                collapsed ? "justify-center" : ""
              } ${active ? "bg-primary text-white" : "text-ink-soft hover:bg-surface hover:text-ink"}`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      <div className={`border-t border-line ${collapsed ? "flex justify-center p-3" : "p-4"}`}>
        {collapsed ? (
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-sm font-semibold text-primary"
            title="Finanzas bia · finanzas@bia.app"
          >
            FB
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-sm font-semibold text-primary">
              FB
            </div>
            <div className="text-xs">
              <div className="font-semibold">Finanzas bia</div>
              <div className="text-ink-soft">finanzas@bia.app</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
