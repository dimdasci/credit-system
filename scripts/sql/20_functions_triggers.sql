-- Receipt numbering sequence and function (must be defined before use)
DO $$ BEGIN
  PERFORM 1 FROM pg_class WHERE relkind = 'S' AND relname = 'receipt_number_seq';
  IF NOT FOUND THEN
    CREATE SEQUENCE receipt_number_seq;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS text AS $$
DECLARE
  merchant_prefix text := 'R-' || upper(coalesce(current_setting('app.merchant_id', true), 'TEST')) || '-';
  year_part text := extract(year from now())::text;
  seq_num text := lpad(nextval('receipt_number_seq')::text, 4, '0');
BEGIN
  RETURN merchant_prefix || year_part || '-' || seq_num;
END;
$$ LANGUAGE plpgsql;

-- Now set default after function exists
ALTER TABLE receipts
  ALTER COLUMN receipt_number SET DEFAULT generate_receipt_number();

-- Immutability: block UPDATE/DELETE on ledger_entries
CREATE OR REPLACE FUNCTION ledger_entries_immutable_trigger()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries are immutable; use compensating entries only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_entries_immutable ON ledger_entries;
CREATE TRIGGER ledger_entries_immutable
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_immutable_trigger();

-- Auto-set lot_id/lot_month for issuance (amount > 0)
CREATE OR REPLACE FUNCTION ledger_entries_set_lot_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.amount > 0 THEN
    IF NEW.lot_id IS NULL THEN
      NEW.lot_id := NEW.entry_id;
    END IF;
    NEW.lot_month := NEW.created_month;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_entries_set_lot_id_trigger ON ledger_entries;
CREATE TRIGGER ledger_entries_set_lot_id_trigger
  BEFORE INSERT ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_set_lot_id();

-- Maintain updated_at on idempotency updates
CREATE OR REPLACE FUNCTION idempotency_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS idempotency_touch_updated_at_trigger ON idempotency_tracking;
CREATE TRIGGER idempotency_touch_updated_at_trigger
  BEFORE UPDATE ON idempotency_tracking
  FOR EACH ROW EXECUTE FUNCTION idempotency_touch_updated_at();

-- Balance cache maintenance
CREATE OR REPLACE FUNCTION update_user_balance()
RETURNS trigger AS $$
BEGIN
  INSERT INTO user_balance (user_id, balance, last_entry_id, last_entry_month)
  VALUES (NEW.user_id, NEW.amount, NEW.entry_id, NEW.created_month)
  ON CONFLICT (user_id)
  DO UPDATE SET
    balance = user_balance.balance + NEW.amount,
    last_updated = now(),
    last_entry_id = NEW.entry_id,
    last_entry_month = NEW.created_month;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_balance_trigger ON ledger_entries;
CREATE TRIGGER update_user_balance_trigger
  AFTER INSERT ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION update_user_balance();

-- Products immutability: only archived_at can change
CREATE OR REPLACE FUNCTION products_immutable_trigger()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.product_code != NEW.product_code OR
    OLD.title != NEW.title OR
    OLD.credits != NEW.credits OR
    OLD.access_period_days != NEW.access_period_days OR
    OLD.distribution != NEW.distribution OR
    OLD.grant_policy IS DISTINCT FROM NEW.grant_policy OR
    OLD.effective_at != NEW.effective_at
  ) THEN
    RAISE EXCEPTION 'Products are immutable except for archived_at';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_immutable ON products;
CREATE TRIGGER products_immutable
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION products_immutable_trigger();

-- Auto-archive previous operation type versions
CREATE OR REPLACE FUNCTION auto_archive_operation_types()
RETURNS trigger AS $$
BEGIN
  UPDATE operation_types
  SET archived_at = NEW.effective_at
  WHERE operation_code = NEW.operation_code
    AND archived_at IS NULL
    AND effective_at != NEW.effective_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_archive_operation_types_trigger ON operation_types;
CREATE TRIGGER auto_archive_operation_types_trigger
  BEFORE INSERT ON operation_types
  FOR EACH ROW EXECUTE FUNCTION auto_archive_operation_types();

-- Receipt numbering function and sequence moved to top of file
