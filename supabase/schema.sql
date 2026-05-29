-- Esquema de la conciliación bancaria (Supabase / Postgres).
-- Ejecutar una vez en el SQL Editor de Supabase.

-- Base de transactions del mes (todas las cuentas, una carga global por período)
create table if not exists transactions (
  id                    bigserial primary key,
  period                text   not null,
  transaction_id        bigint not null,
  bill_id               text,
  amount                numeric not null,
  payment_method_type   text,
  payment_method_name   text,
  status                text,
  payment_date          date,
  collection_type       text,
  created_at            timestamptz default now()
);
create index if not exists idx_txn_period on transactions(period);
create index if not exists idx_txn_period_txnid on transactions(period, transaction_id);

-- Extracto del banco normalizado, por cuenta y período (TODOS los movimientos)
create table if not exists bank_movements (
  id           bigserial primary key,
  period       text not null,
  account_id   text not null,
  fecha        date,
  descripcion  text,
  sucursal     text,
  ref1         text,
  ref2         text,
  documento    text,
  valor        numeric,
  bill_id      text,
  created_at   timestamptz default now()
);
create index if not exists idx_bank_period_acct on bank_movements(period, account_id);

-- Cruces resultantes (1 fila por transaction conciliada con una cuenta)
create table if not exists crossings (
  id              bigserial primary key,
  period          text not null,
  account_id      text not null,
  transaction_id  bigint,
  bill_id_txn     text,
  bill_id_banco   text,
  valor_banco     numeric,
  valor_aplicado  numeric,
  diferencia      numeric,
  fecha_banco     date,
  fecha_pago      date,
  sucursal        text,
  tipo            text,
  nivel_match     text,
  created_at      timestamptz default now()
);
create index if not exists idx_cross_period on crossings(period);
create index if not exists idx_cross_period_acct on crossings(period, account_id);
create index if not exists idx_cross_period_txnid on crossings(period, transaction_id);
