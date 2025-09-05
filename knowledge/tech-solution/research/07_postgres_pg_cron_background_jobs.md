# Postgres Background Jobs with pg_cron (Default)

Lean approach for expiry and cleanup jobs without a separate app service. Use Postgres `pg_cron` to schedule stored procedures in each merchant database.

## 1) Prerequisites

- Postgres instance with `pg_cron` available and `CREATE EXTENSION` permitted.
- One database per merchant (isolation). The same schedules are applied per DB.

## 2) Enable and Schedule (migrations)

```sql
-- 001_enable_pg_cron.sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Optional: isolate logs
CREATE SCHEMA IF NOT EXISTS app;
CREATE TABLE IF NOT EXISTS app.job_runs (
  id            bigserial primary key,
  job_name      text not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  affected_rows integer,
  error         text
);

-- 002_schedule_jobs.sql
-- Every 5 minutes: cleanup expired open operations
SELECT cron.schedule('ops_cleanup', '*/5 * * * *', $$CALL app.cleanup_expired_operations()$$);

-- Daily at 02:00: expire lots
SELECT cron.schedule('lot_expiry', '0 2 * * *', $$CALL app.expire_lots()$$);

-- Daily at 03:00: idempotency table cleanup
SELECT cron.schedule('idempotency_cleanup', '0 3 * * *', $$CALL app.cleanup_idempotency()$$);
```

## 3) Job Functions (skeletons)

```sql
-- 010_fn_expire_lots.sql
CREATE OR REPLACE FUNCTION app.expire_lots() RETURNS void LANGUAGE plpgsql AS $$
DECLARE locked boolean; v_count integer := 0; v_batch integer := 500;
BEGIN
  SELECT pg_try_advisory_lock(hashtext('app.expire_lots')) INTO locked;
  IF NOT locked THEN RETURN; END IF;

  BEGIN
    -- Example strategy (pseudo-SQL; adapt to your schema):
    -- 1) Find lots with expires_at < now() and positive remaining balance
    -- 2) Insert expiry debit entries to zero remaining balance

    -- v_count := number of affected rows
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO app.job_runs(job_name, error) VALUES ('lot_expiry', SQLERRM);
    PERFORM pg_advisory_unlock(hashtext('app.expire_lots'));
    RAISE;
  END;

  INSERT INTO app.job_runs(job_name, finished_at, affected_rows)
  VALUES ('lot_expiry', now(), v_count);
  PERFORM pg_advisory_unlock(hashtext('app.expire_lots'));
END;$$;

-- 011_fn_cleanup_expired_operations.sql
CREATE OR REPLACE FUNCTION app.cleanup_expired_operations() RETURNS void LANGUAGE plpgsql AS $$
DECLARE locked boolean; v_count integer := 0;
BEGIN
  SELECT pg_try_advisory_lock(hashtext('app.cleanup_expired_operations')) INTO locked;
  IF NOT locked THEN RETURN; END IF;

  BEGIN
    -- Close operations whose expires_at < now() and status = 'open'
    -- Optionally emit debit/rollback entries if business rules require
    -- v_count := number of updated rows
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO app.job_runs(job_name, error) VALUES ('ops_cleanup', SQLERRM);
    PERFORM pg_advisory_unlock(hashtext('app.cleanup_expired_operations'));
    RAISE;
  END;

  INSERT INTO app.job_runs(job_name, finished_at, affected_rows)
  VALUES ('ops_cleanup', now(), v_count);
  PERFORM pg_advisory_unlock(hashtext('app.cleanup_expired_operations'));
END;$$;

-- 012_fn_cleanup_idempotency.sql
CREATE OR REPLACE FUNCTION app.cleanup_idempotency() RETURNS void LANGUAGE plpgsql AS $$
DECLARE locked boolean; v_count integer := 0; v_retention interval := interval '7 days';
BEGIN
  SELECT pg_try_advisory_lock(hashtext('app.cleanup_idempotency')) INTO locked;
  IF NOT locked THEN RETURN; END IF;

  BEGIN
    -- Delete idempotency keys older than retention window (finished states only)
    -- v_count := number of deleted rows
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO app.job_runs(job_name, error) VALUES ('idempotency_cleanup', SQLERRM);
    PERFORM pg_advisory_unlock(hashtext('app.cleanup_idempotency'));
    RAISE;
  END;

  INSERT INTO app.job_runs(job_name, finished_at, affected_rows)
  VALUES ('idempotency_cleanup', now(), v_count);
  PERFORM pg_advisory_unlock(hashtext('app.cleanup_idempotency'));
END;$$;
```

## 4) Notes

- Concurrency: advisory locks prevent overlapping runs.
- Batching: operate in small batches to keep locks short and reduce bloat.
- Idempotency: derive effects from ledger state; functions can be re‑run safely.
- Observability: record per‑run rows in `app.job_runs`; surface via admin queries or a health endpoint.

## 5) Fallback

If `pg_cron` is unavailable, a small Node entrypoint can call the same stored procedures on a schedule (container‑based cron). Prefer DB‑native scheduling where possible.

