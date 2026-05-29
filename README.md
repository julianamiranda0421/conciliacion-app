# Conciliación Bancaria 360 · bia

App web (Next.js + Supabase, desplegada en Vercel) para conciliar los
movimientos de las cuentas bancarias contra la base de `transactions`.

## Módulos
- **Cargas**: sube el extracto del banco por cuenta y período (Bancolombia en PDF
  se convierte solo; también acepta Excel).
- **Transactions**: carga global mensual de la base de pagos; dashboard con la
  columna *Cuenta cruce* que se llena por Transaction ID.
- **Conciliaciones**: dashboard por cuenta (conciliado, diferencias, cheques
  devueltos, todos los movimientos del extracto).

## Stack
- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Supabase (Postgres) para persistencia
- `unpdf` para leer el PDF del banco, `SheetJS` para Excel
- Desplegado en Vercel (push a `main` queda versionado en GitHub)

## Desarrollo
```bash
npm install
npm run dev
```
Variables de entorno en `.env.local` (ver `lib/supabase.ts`): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. El esquema de la base
está en `supabase/schema.sql`.
