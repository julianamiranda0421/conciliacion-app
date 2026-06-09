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

-- Registro de la última carga por período y scope (transactions o cuenta).
-- Sirve para mostrar la fecha de corte y el historial de cargas (solo el último).
create table if not exists loads (
  id          bigserial primary key,
  period      text not null,
  scope       text not null,   -- 'transactions' o el id de la cuenta
  cutoff_date date,            -- fecha de corte
  filename    text,
  row_count   int,
  updated_at  timestamptz default now()
);
create unique index if not exists idx_loads_period_scope on loads(period, scope);

-- Cartera 360: espejo de la query "Payments 360" de Metabase (factura ⟕ pago, desde 2026).
-- Grano = una fila por factura×pago (una factura sin pago = 1 fila con transaction_id NULL).
-- Se reemplaza completa en cada sincronización (delete-all + insert).
create table if not exists bills_360 (
  id                   bigserial primary key,
  bill_id              bigint not null,
  period               text,
  contract_id          bigint,
  company_id           bigint,
  created_at           timestamptz,
  expired_date         timestamptz,
  total                numeric,
  total_with_deposit   numeric,
  bill_status          text,
  transaction_id       bigint,
  payment_date         timestamptz,
  payment_method_type  text,
  payment_method_name  text,
  collection_type      text,
  network_collection   text,
  reference_bill       text,
  is_partial_payment   boolean,
  amount               numeric,
  bia_credits          numeric,
  transaction_state    text,
  s3_path_document     text,
  synced_at            timestamptz default now()
);
-- Clasificación manual de movimientos: marcar un ingreso como "recaudo".
-- Clave por FIRMA del movimiento (sobrevive a re-cargas del extracto, donde los
-- ids de bank_movements cambian). Si existe fila => el movimiento es recaudo.
create table if not exists movement_flags (
  id          bigserial primary key,
  period      text not null,
  account_id  text not null,
  sig         text not null,
  es_recaudo  boolean not null default true,
  updated_at  timestamptz default now(),
  unique(period, account_id, sig)
);
create index if not exists idx_mflags_period_acct on movement_flags(period, account_id);

create index if not exists idx_b360_bill on bills_360(bill_id);
create index if not exists idx_b360_period on bills_360(period);
create index if not exists idx_b360_company on bills_360(company_id);
create index if not exists idx_b360_status on bills_360(bill_status);
create index if not exists idx_b360_txn on bills_360(transaction_id);
