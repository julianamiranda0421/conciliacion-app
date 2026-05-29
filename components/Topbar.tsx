export function Topbar() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-line bg-white px-6 lg:px-8">
      <div className="text-sm text-ink-soft">
        Conciliación Bancaria 360
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right text-xs leading-tight">
          <div className="font-semibold text-ink">Finanzas bia</div>
          <div className="text-ink-soft">Administrador</div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
          FB
        </div>
      </div>
    </header>
  );
}
