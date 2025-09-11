-- Additional constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'products_grant_policy_check' 
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_grant_policy_check
      CHECK (
        (distribution = 'grant' AND grant_policy IS NOT NULL) OR
        (distribution = 'sellable' AND grant_policy IS NULL)
      );
  END IF;
END$$;

-- Ledger indexes (parent-level; create on all partitions)
CREATE INDEX IF NOT EXISTS ledger_entries_fifo_selection_idx
  ON ledger_entries (user_id, expires_at, created_at)
  WHERE amount > 0;

CREATE INDEX IF NOT EXISTS ledger_entries_balance_calc_idx
  ON ledger_entries (user_id, created_at DESC);

-- Operations indexes & constraints
CREATE UNIQUE INDEX IF NOT EXISTS operations_single_open_per_user
  ON operations (user_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS operations_open_by_expiry_idx
  ON operations (expires_at)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS operations_cleanup_idx
  ON operations (COALESCE(closed_at, opened_at))
  WHERE status <> 'open';

-- Receipts lookup index
CREATE INDEX IF NOT EXISTS receipts_user_lookup_idx
  ON receipts (user_id, issued_at DESC);

-- Products active lookup
CREATE INDEX IF NOT EXISTS products_active_lookup_idx
  ON products (distribution, effective_at)
  WHERE archived_at IS NULL;

-- Idempotency cleanup
CREATE INDEX IF NOT EXISTS idempotency_tracking_cleanup_idx
  ON idempotency_tracking (expires_at)
  WHERE state IN ('SUCCEEDED','FAILED_FINAL');
