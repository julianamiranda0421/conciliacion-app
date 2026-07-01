// Helpers de formato para las tablas de detalle (compartidos por todas las vistas).

// Moneda COP: "$927.240" y negativos con el signo ANTES del peso: "-$184.347.720".
// Devuelve "" para null/"" (no fuerza "$0" en celdas vacías).
export function money(v: unknown): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n).toLocaleString("es-CO", { maximumFractionDigits: 0 });
  return (n < 0 ? "-$" : "$") + abs;
}

// Moneda compacta para ejes/etiquetas de gráficos: "$30,7 mil M", "$5 M", "$920 K".
// (En Colombia "mil M" = mil millones; se evita "B" que suena a billón 1e12.)
export function moneyShort(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const f = (x: number, u: string) =>
    `${sign}$${x.toLocaleString("es-CO", { maximumFractionDigits: 1 })}${u}`;
  if (abs >= 1e9) return f(abs / 1e9, " mil M");
  if (abs >= 1e6) return f(abs / 1e6, " M");
  if (abs >= 1e3) return f(abs / 1e3, " K");
  return `${sign}$${abs.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

// Fecha en formato DD/MM/YYYY: "2026-06-16" -> "16/06/2026".
// Si el valor no parece una fecha ISO, lo devuelve igual.
export function fmtDate(v: unknown): string {
  const s = String(v ?? "");
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

// Color por signo para los valores de las tablas de detalle:
// positivo -> verde, negativo -> rojo, cero/vacío -> neutro.
export function signClass(v: unknown): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "";
  return n < 0 ? "text-error" : "text-success";
}
