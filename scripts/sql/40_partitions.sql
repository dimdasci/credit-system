-- Partition helper for monthly partitions on ledger_entries
CREATE OR REPLACE FUNCTION create_monthly_partitions(
  table_name text,
  months_ahead integer DEFAULT 3
) RETURNS void AS $$
DECLARE
  partition_date date;
  partition_name text;
  start_date text;
  end_date text;
BEGIN
  FOR i IN 0..months_ahead LOOP
    partition_date := date_trunc('month', now()) + (i || ' months')::interval;
    partition_name := table_name || '_' || to_char(partition_date, 'YYYY_MM');
    start_date := partition_date::text;
    end_date := (partition_date + interval '1 month')::text;

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
      partition_name, table_name, start_date, end_date
    );

    -- Create partition-specific indexes for pruning and performance
    IF table_name = 'ledger_entries' THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I (user_id, expires_at, created_at) WHERE amount > 0',
        partition_name || '_fifo_idx', partition_name
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I (user_id, created_at DESC)',
        partition_name || '_balance_idx', partition_name
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Initialize partitions for current and next 6 months
SELECT create_monthly_partitions('ledger_entries', 6);

