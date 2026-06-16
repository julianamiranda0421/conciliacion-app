"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Upload, Scale, Zap, Wallet } from "lucide-react";

const NAV = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/cargas", label: "Cargas", icon: Upload },
  { href: "/cartera", label: "Cartera 360", icon: Wallet },
  { href: "/conciliaciones", label: "Conciliaciones", icon: Scale },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-white md:flex">
      <div className="flex items-center gap-3 border-b border-line px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
          <Zap className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-bold leading-tight">bia</div>
          <div className="text-xs text-ink-soft">Conciliación Bancaria</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-primary text-white"
                  : "text-ink-soft hover:bg-surface hover:text-ink"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-sm font-semibold text-primary">
            FB
          </div>
          <div className="text-xs">
            <div className="font-semibold">Finanzas bia</div>
            <div className="text-ink-soft">finanzas@bia.app</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
