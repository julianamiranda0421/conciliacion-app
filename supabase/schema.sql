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
  cus                  text,  -- CUS del pago PSE (llave del archivo Transacciones ACH)
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

-- Observaciones manuales por partida conciliada (clave por transaction_id, sobrevive re-cargas).
create table if not exists observations (
  id              bigserial primary key,
  period          text not null,
  account_id      text not null,
  transaction_id  bigint not null,
  texto           text,
  updated_at      timestamptz default now(),
  unique(period, account_id, transaction_id)
);
create index if not exists idx_obs_period_acct on observations(period, account_id);

-- Observaciones de cheques devueltos (clave por documento del cheque, que NO tiene
-- transaction_id). Para anotar "ya se entregó el cheque" u otros comentarios.
create table if not exists dev_observations (
  id          bigserial primary key,
  period      text not null,
  account_id  text not null,
  documento   text not null,
  texto       text,
  updated_at  timestamptz default now(),
  unique(period, account_id, documento)
);
create index if not exists idx_devobs_period_acct on dev_observations(period, account_id);

-- Adquirencias (recaudo por tarjeta de crédito del 7772). Cada fila es un cargo TC:
-- consumo = valor factura; comisiones se descuentan; neto = ingreso al banco.
-- Carga aparte por período; se reemplaza completa (delete por período + insert).
create table if not exists adquirencias (
  id            bigserial primary key,
  period        text not null,
  fecha_vale    date,
  fecha_abono   date,
  red           text,
  terminal      text,
  num_autoriza  text,
  tarjeta       text,
  tipo_tarjeta  text,
  consumo       numeric,
  comision      numeric,
  rete_fuente   numeric,
  rete_iva      numeric,
  rete_ica      numeric,
  neto          numeric,
  created_at    timestamptz default now()
);
create index if not exists idx_adq_period on adquirencias(period);

-- PSE (recaudo PSE del 7772, archivo "Transacciones ACH"). Cada fila es una
-- transacción PSE aprobada (débito en cuenta del cliente) abonada al 7772.
-- Carga aparte por período; se reemplaza completa (delete por período + insert).
create table if not exists pse_transactions (
  id                bigserial primary key,
  period            text not null,
  cus               text,
  fecha             date,
  hora              text,
  valor             numeric,
  banco_originador  text,
  pagador           text,   -- Referencia 1 (NIT/CC del pagador)
  tipo_usuario      text,
  estado            text,
  medio_pago        text,
  cod_autorizacion  text,
  ticket_id         text,
  servicio          text,
  cuenta_destino    text,
  created_at        timestamptz default now()
);
create index if not exists idx_pse_period on pse_transactions(period);

-- Cierre de conciliación por cuenta y período: los saldos que el usuario digita
-- del extracto (saldo inicial, ingresos, egresos, saldo final) + el estado de
-- aprobación del mes. Un registro por (period, account_id). El cierre se aprueba
-- solo cuando los saldos digitados cuadran contra los movimientos cargados.
create table if not exists recon_closing (
  id             bigserial primary key,
  period         text not null,
  account_id     text not null,
  saldo_inicial  numeric,
  ingresos       numeric,
  egresos        numeric,
  saldo_final    numeric,
  aprobado       boolean not null default false,
  aprobado_por   text,
  aprobado_en    timestamptz,
  updated_at     timestamptz default now(),
  unique(period, account_id)
);
create index if not exists idx_closing_period_acct on recon_closing(period, account_id);

-- Vínculo factura↔movimiento por cuenta y período. Se llena cuando se sube un
-- archivo que SÍ trae factura (los "CORTE"/consulta de movimientos). Sirve para que,
-- al subir después el estado de cuenta oficial (que NO trae factura), cada movimiento
-- herede su factura por fecha+valor y NO se pierda la conciliación ya hecha.
-- Se reemplaza por período+cuenta en cada carga con facturas (delete + insert).
create table if not exists movement_bills (
  id          bigserial primary key,
  period      text not null,
  account_id  text not null,
  fecha       date,
  valor       numeric,
  bill_id     text,
  created_at  timestamptz default now()
);
create index if not exists idx_movbills_period_acct on movement_bills(period, account_id);

create index if not exists idx_b360_bill on bills_360(bill_id);
create index if not exists idx_b360_period on bills_360(period);
create index if not exists idx_b360_company on bills_360(company_id);
create index if not exists idx_b360_status on bills_360(bill_status);
create index if not exists idx_b360_txn on bills_360(transaction_id);
