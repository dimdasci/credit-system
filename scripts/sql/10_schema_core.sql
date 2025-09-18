-- Application schema (for background jobs, sequences, etc.)
CREATE SCHEMA IF NOT EXISTS app;

-- Products (catalog)
CREATE TABLE IF NOT EXISTS products (
  product_code       text PRIMARY KEY,
  title              text NOT NULL,
  credits            integer NOT NULL CHECK (credits > 0),
  access_period_days integer NOT NULL CHECK (access_period_days > 0),
  distribution       text NOT NULL CHECK (distribution IN ('sellable', 'grant')),
  grant_policy       text CHECK (grant_policy IN ('apply_on_signup', 'manual_grant')),
  effective_at       timestamptz NOT NULL DEFAULT now(),
  archived_at        timestamptz
);

-- Country-specific pricing
CREATE TABLE IF NOT EXISTS price_rows (
  product_code  text NOT NULL REFERENCES products(product_code),
  country       text NOT NULL, -- ISO-3166-1 alpha-2 or "*" for fallback
  currency      text NOT NULL,
  amount        decimal(19,4) NOT NULL CHECK (amount > 0),
  vat_info      jsonb,
  PRIMARY KEY (product_code, country)
);

-- Operation types (rates)
CREATE TABLE IF NOT EXISTS operation_types (
  operation_code    text PRIMARY KEY,
  display_name      text NOT NULL,
  resource_unit     text NOT NULL,
  credits_per_unit  decimal(19,6) NOT NULL CHECK (credits_per_unit > 0),
  effective_at      timestamptz NOT NULL DEFAULT now(),
  archived_at       timestamptz,
  CONSTRAINT operation_types_lifecycle CHECK (archived_at IS NULL OR archived_at > effective_at)
);

-- Ledger entries (immutable journal), partitioned by created_month (explicit)
CREATE TABLE IF NOT EXISTS ledger_entries (
  entry_id        uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id         text NOT NULL,
  -- Self-reference identity to the issuance entry (lot)
  lot_id          uuid NOT NULL,
  lot_month       date NOT NULL,
  amount          integer NOT NULL,
  reason          text NOT NULL CHECK (reason IN ('purchase','welcome','promo','adjustment','debit','expiry','refund','chargeback')),
  -- Operation context
  operation_type  text NOT NULL,
  resource_amount decimal(19,4),
  resource_unit   text,
  workflow_id     text,
  -- Issuance-only context
  product_code    text,
  expires_at      timestamptz,
  -- Audit and partition key
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_month   date NOT NULL,
  PRIMARY KEY (entry_id, created_month)
) PARTITION BY RANGE (created_month);

-- Enforce financial integrity and identity rules (add constraints if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ledger_entries_amount_not_zero' 
      AND conrelid = 'ledger_entries'::regclass
  ) THEN
    ALTER TABLE ledger_entries
      ADD CONSTRAINT ledger_entries_amount_not_zero CHECK (amount != 0);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ledger_entries_created_month_check' 
      AND conrelid = 'ledger_entries'::regclass
  ) THEN
    ALTER TABLE ledger_entries
      ADD CONSTRAINT ledger_entries_created_month_check
      CHECK (created_month = (date_trunc('month', created_at AT TIME ZONE 'UTC'))::date);
  END IF;
END$$;

-- Composite self-reference across partitions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ledger_entries_lot_fk' 
      AND conrelid = 'ledger_entries'::regclass
  ) THEN
    ALTER TABLE ledger_entries
      ADD CONSTRAINT ledger_entries_lot_fk
      FOREIGN KEY (lot_id, lot_month) REFERENCES ledger_entries(entry_id, created_month)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END$$;

-- Issuance vs debit role context
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ledger_entries_role_context' 
      AND conrelid = 'ledger_entries'::regclass
  ) THEN
    ALTER TABLE ledger_entries
      ADD CONSTRAINT ledger_entries_role_context CHECK (
        (amount > 0 AND product_code IS NOT NULL AND expires_at IS NOT NULL AND lot_id = entry_id AND lot_month = created_month)
        OR
        (amount <= 0 AND product_code IS NULL AND expires_at IS NULL)
      );
  END IF;
END$$;

-- Operations (unpartitioned), partial unique enforces single open per user
CREATE TABLE IF NOT EXISTS operations (
  operation_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             text NOT NULL,
  operation_type_code text NOT NULL REFERENCES operation_types(operation_code),
  workflow_id         text,
  captured_rate       decimal(19,6) NOT NULL CHECK (captured_rate > 0),
  status              text NOT NULL CHECK (status IN ('open','completed','expired')),
  opened_at           timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  closed_at           timestamptz,
  CONSTRAINT operations_expiry_after_open CHECK (expires_at > opened_at)
);

-- Receipts (unpartitioned)
CREATE TABLE IF NOT EXISTS receipts (
  receipt_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  text NOT NULL,
  lot_id                   uuid NOT NULL,
  lot_created_month        date NOT NULL,
  receipt_number           text NOT NULL UNIQUE,
  issued_at                timestamptz NOT NULL DEFAULT now(),
  purchase_snapshot        jsonb NOT NULL,
  merchant_config_snapshot jsonb NOT NULL,
  UNIQUE (lot_id),
  FOREIGN KEY (lot_id, lot_created_month) REFERENCES ledger_entries(entry_id, created_month)
);

-- Balance cache
CREATE TABLE IF NOT EXISTS user_balance (
  user_id       text PRIMARY KEY,
  balance       integer NOT NULL DEFAULT 0,
  last_updated  timestamptz NOT NULL DEFAULT now(),
  last_entry_id uuid NOT NULL,
  last_entry_month date NOT NULL,
  CONSTRAINT user_balance_last_entry_fk FOREIGN KEY (last_entry_id, last_entry_month)
    REFERENCES ledger_entries(entry_id, created_month)
);

-- Idempotency tracking
CREATE TABLE IF NOT EXISTS idempotency_tracking (
  key_hash     text PRIMARY KEY,
  state        text NOT NULL CHECK (state IN ('PENDING','SUCCEEDED','FAILED_RETRIABLE','FAILED_FINAL')),
  command_type text NOT NULL,
  result_data  jsonb,
  error_data   jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  CONSTRAINT idempotency_state_transition CHECK (
    (state = 'PENDING' AND result_data IS NULL) OR
    (state = 'SUCCEEDED' AND result_data IS NOT NULL) OR
    (state IN ('FAILED_RETRIABLE','FAILED_FINAL') AND error_data IS NOT NULL)
  )
);
