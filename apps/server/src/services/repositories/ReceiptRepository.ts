import { MerchantContext } from "@credit-system/shared"
import * as SqlSchema from "@effect/sql/SqlSchema"
import { DatabaseManager } from "@server/db/DatabaseManager.js"
import { Receipt } from "@server/domain/receipts/Receipt.js"
import type { DomainError } from "@server/domain/shared/DomainErrors.js"
import { InvalidRequest, ServiceUnavailable } from "@server/domain/shared/DomainErrors.js"
import { Effect, Schema } from "effect"

// Query options for receipt history
export interface ReceiptQueryOptions {
  limit?: number
  offset?: number
  fromDate?: Date
  toDate?: Date
  sortBy?: "issued_at" | "receipt_number"
  sortOrder?: "asc" | "desc"
}

// Repository interface for receipt document management
export interface ReceiptRepositoryContract {
  // Core receipt operations
  createReceipt: (receipt: Receipt) => Effect.Effect<void, DomainError>
  getReceiptById: (receipt_id: string) => Effect.Effect<Receipt | null, DomainError>
  getReceiptByNumber: (receipt_number: string) => Effect.Effect<Receipt | null, DomainError>

  // Lot-based queries (one receipt per purchase lot)
  getReceiptByLot: (lot_id: string) => Effect.Effect<Receipt | null, DomainError>
  hasReceiptForLot: (lot_id: string) => Effect.Effect<boolean, DomainError>

  // External reference queries (for idempotency)
  getReceiptByExternalRef: (external_ref: string) => Effect.Effect<Receipt | null, DomainError>

  // User receipt history
  getUserReceipts: (user_id: string, options?: ReceiptQueryOptions) => Effect.Effect<Array<Receipt>, DomainError>
  getUserReceiptCount: (user_id: string) => Effect.Effect<number, DomainError>

  // Receipt numbering (merchant-scoped sequences)
  getNextReceiptNumber: (seriesPrefix: string, year?: number) => Effect.Effect<string, DomainError>
  getReceiptsByNumberRange: (start_number: string, end_number: string) => Effect.Effect<Array<Receipt>, DomainError>

  // Tax and compliance
  getReceiptsForPeriod: (fromDate: Date, toDate: Date) => Effect.Effect<Array<Receipt>, DomainError>
  getReceiptTotalsForPeriod: (fromDate: Date, toDate: Date) => Effect.Effect<{
    total_receipts: number
    total_amount: number
    currencies: Array<{ currency: string; total: number }>
    tax_breakdown: Array<{ tax_type: string; total: number }>
  }, DomainError>

  // Data integrity
  validateReceiptIntegrity: (receipt_id: string) => Effect.Effect<{
    valid: boolean
    lot_exists: boolean
    purchase_snapshot_complete: boolean
    merchant_config_complete: boolean
  }, DomainError>
}

// Database error mapping utility
const mapDatabaseError = (error: unknown): ServiceUnavailable => {
  if (error && typeof error === "object") {
    const errorObj = error as { code?: string; message?: string; name?: string }

    // PostgreSQL connection errors
    if (errorObj.code === "ECONNREFUSED" || errorObj.code === "ENOTFOUND") {
      return new ServiceUnavailable({
        service: "ReceiptRepository",
        reason: "database_connection_failure",
        retry_after_seconds: 5
      })
    }

    // PostgreSQL timeout errors
    if (errorObj.code === "ETIMEOUT" || errorObj.message?.includes("timeout")) {
      return new ServiceUnavailable({
        service: "ReceiptRepository",
        reason: "transaction_timeout",
        retry_after_seconds: 10
      })
    }

    // PostgreSQL unique constraint violations (duplicate lot_id)
    if (errorObj.code === "23505" || errorObj.code === "40001") {
      return new ServiceUnavailable({
        service: "ReceiptRepository",
        reason: "concurrent_update_conflict",
        retry_after_seconds: 2
      })
    }

    // Resource exhaustion (connection pool, memory)
    if (errorObj.code === "53300" || errorObj.code === "53200") {
      return new ServiceUnavailable({
        service: "ReceiptRepository",
        reason: "resource_exhaustion",
        retry_after_seconds: 15
      })
    }
  }

  // Default fallback for unknown database errors
  return new ServiceUnavailable({
    service: "ReceiptRepository",
    reason: "database_connection_failure",
    retry_after_seconds: 5
  })
}

export class ReceiptRepository extends Effect.Service<ReceiptRepository>()(
  "ReceiptRepository",
  {
    effect: Effect.gen(function*() {
      const db = yield* DatabaseManager
      const merchantContext = yield* MerchantContext

      // Core receipt operations
      const _createReceipt = SqlSchema.void({
        Request: Receipt,
        execute: (receipt) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)

            return yield* sql`
              INSERT INTO receipts (
                receipt_id, user_id, lot_id, lot_created_month, receipt_number,
                issued_at, purchase_snapshot, merchant_config_snapshot
              ) VALUES (
                ${receipt.receipt_id}, ${receipt.user_id}, ${receipt.lot_id},
                ${receipt.lot_created_month}, ${receipt.receipt_number},
                ${receipt.issued_at}, ${JSON.stringify(receipt.purchase_snapshot)},
                ${JSON.stringify(receipt.merchant_config_snapshot)}
              )
            `
          })
      })

      const _getReceiptById = (receipt_id: string) =>
        Effect.gen(function*() {
          const sql = yield* db.getConnection(merchantContext.merchantId)

          const result = yield* sql<Receipt.Encoded>`
            SELECT * FROM receipts
            WHERE receipt_id = ${receipt_id}
            LIMIT 1
          `

          if (result.length === 0) {
            return null
          }

          return yield* Schema.decodeUnknown(Receipt)(result[0])
        })

      const _getReceiptByNumber = (receipt_number: string) =>
        Effect.gen(function*() {
          const sql = yield* db.getConnection(merchantContext.merchantId)

          const result = yield* sql<Receipt.Encoded>`
            SELECT * FROM receipts
            WHERE receipt_number = ${receipt_number}
            LIMIT 1
          `

          if (result.length === 0) {
            return null
          }

          return yield* Schema.decodeUnknown(Receipt)(result[0])
        })

      const _getReceiptByLot = (lot_id: string) =>
        Effect.gen(function*() {
          const sql = yield* db.getConnection(merchantContext.merchantId)

          const result = yield* sql<Receipt.Encoded>`
            SELECT * FROM receipts
            WHERE lot_id = ${lot_id}
            LIMIT 1
          `

          if (result.length === 0) {
            return null
          }

          return yield* Schema.decodeUnknown(Receipt)(result[0])
        })

      const _getReceiptByExternalRef = (external_ref: string) =>
        Effect.gen(function*() {
          const sql = yield* db.getConnection(merchantContext.merchantId)

          const result = yield* sql<Receipt.Encoded>`
            SELECT r.* FROM receipts r
            INNER JOIN ledger_entries le ON r.lot_id = le.lot_id AND r.lot_created_month = le.lot_month
            WHERE le.workflow_id = ${external_ref}
              AND le.reason = 'purchase'
              AND le.entry_id = le.lot_id
            LIMIT 1
          `

          if (result.length === 0) {
            return null
          }

          return yield* Schema.decodeUnknown(Receipt)(result[0])
        })

      const _getUserReceipts = SqlSchema.findAll({
        Request: Schema.Struct({
          user_id: Schema.String,
          options: Schema.optional(Schema.Unknown)
        }),
        Result: Receipt,
        execute: ({ options, user_id }) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            const opts = (options as ReceiptQueryOptions) || {}

            // Build dynamic query fragments
            const fromDateFilter = opts.fromDate ? sql`AND issued_at >= ${opts.fromDate}` : sql``
            const toDateFilter = opts.toDate ? sql`AND issued_at <= ${opts.toDate}` : sql``

            // Dynamic sorting - using string template to avoid sql.unsafe in tests
            const sortColumn = opts.sortBy === "receipt_number" ? "receipt_number" : "issued_at"
            const sortOrder = opts.sortOrder === "asc" ? "ASC" : "DESC"

            const limitClause = opts.limit ? sql`LIMIT ${opts.limit}` : sql``
            const offsetClause = opts.offset ? sql`OFFSET ${opts.offset}` : sql``

            if (sortColumn === "receipt_number" && sortOrder === "ASC") {
              return yield* sql<Receipt.Encoded>`
                SELECT * FROM receipts
                WHERE user_id = ${user_id}
                ${fromDateFilter}
                ${toDateFilter}
                ORDER BY receipt_number ASC
                ${limitClause}
                ${offsetClause}
              `
            } else if (sortColumn === "receipt_number" && sortOrder === "DESC") {
              return yield* sql<Receipt.Encoded>`
                SELECT * FROM receipts
                WHERE user_id = ${user_id}
                ${fromDateFilter}
                ${toDateFilter}
                ORDER BY receipt_number DESC
                ${limitClause}
                ${offsetClause}
              `
            } else if (sortOrder === "ASC") {
              return yield* sql<Receipt.Encoded>`
                SELECT * FROM receipts
                WHERE user_id = ${user_id}
                ${fromDateFilter}
                ${toDateFilter}
                ORDER BY issued_at ASC
                ${limitClause}
                ${offsetClause}
              `
            } else {
              return yield* sql<Receipt.Encoded>`
                SELECT * FROM receipts
                WHERE user_id = ${user_id}
                ${fromDateFilter}
                ${toDateFilter}
                ORDER BY issued_at DESC
                ${limitClause}
                ${offsetClause}
              `
            }
          })
      })

      return {
        // Core receipt operations
        createReceipt: (receipt: Receipt) => _createReceipt(receipt).pipe(Effect.mapError(mapDatabaseError)),

        getReceiptById: (receipt_id: string) => _getReceiptById(receipt_id).pipe(Effect.mapError(mapDatabaseError)),

        getReceiptByNumber: (receipt_number: string) =>
          _getReceiptByNumber(receipt_number).pipe(Effect.mapError(mapDatabaseError)),

        // Lot-based queries
        getReceiptByLot: (lot_id: string) => _getReceiptByLot(lot_id).pipe(Effect.mapError(mapDatabaseError)),

        getReceiptByExternalRef: (external_ref: string) =>
          _getReceiptByExternalRef(external_ref).pipe(Effect.mapError(mapDatabaseError)),

        hasReceiptForLot: (lot_id: string) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)

            const result = yield* sql<{ exists: boolean }>`
              SELECT EXISTS(
                SELECT 1 FROM receipts WHERE lot_id = ${lot_id}
              ) as exists
            `

            return result[0]?.exists ?? false
          }).pipe(Effect.mapError(mapDatabaseError)),

        // User receipt history
        getUserReceipts: (user_id: string, options?: ReceiptQueryOptions) =>
          _getUserReceipts({ user_id, options }).pipe(Effect.mapError(mapDatabaseError)),

        getUserReceiptCount: (user_id: string) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)

            const result = yield* sql<{ count: number }>`
              SELECT COUNT(*) as count FROM receipts
              WHERE user_id = ${user_id}
            `

            return result[0]?.count ?? 0
          }).pipe(Effect.mapError(mapDatabaseError)),

        // Receipt numbering (merchant-scoped sequences)
        getNextReceiptNumber: (seriesPrefix: string, year?: number) =>
          Effect.gen(function*() {
            const prefixInput = seriesPrefix?.trim()

            if (!prefixInput || prefixInput.length === 0) {
              return yield* Effect.fail(
                new InvalidRequest({
                  field: "receipt_series_prefix",
                  reason: "invalid_parameters",
                  details: "Receipt series prefix is required"
                })
              )
            }

            const prefix = prefixInput.toUpperCase()
            const currentYear = year ?? new Date().getFullYear()
            const sql = yield* db.getConnection(merchantContext.merchantId)

            const sequenceToken = prefix.replace(/[^A-Z0-9]/g, "_").toLowerCase()

            if (sequenceToken.length === 0) {
              return yield* Effect.fail(
                new InvalidRequest({
                  field: "receipt_series_prefix",
                  reason: "format_violation",
                  details: "Prefix must contain alphanumeric characters"
                })
              )
            }

            const sequenceName = `receipt_seq_${sequenceToken}_${currentYear}`

            yield* sql`
              DO $$
              BEGIN
                IF NOT EXISTS (
                  SELECT 1
                  FROM pg_class
                  WHERE relkind = 'S'
                    AND relname = '${sequenceName}'
                ) THEN
                  EXECUTE 'CREATE SEQUENCE ${sequenceName}';
                END IF;
              END $$;
            `.pipe(Effect.mapError(mapDatabaseError))

            const result = yield* sql<{ next_val: string | number }>`
              SELECT nextval('${sequenceName}') as next_val
            `.pipe(Effect.mapError(mapDatabaseError))

            const nextValueRaw = result[0]?.next_val
            const nextValue = typeof nextValueRaw === "string" ? Number(nextValueRaw) : nextValueRaw ?? 1
            const paddedSequence = String(nextValue).padStart(4, "0")

            return `${prefix}-${currentYear}-${paddedSequence}`
          }),

        getReceiptsByNumberRange: (start_number: string, end_number: string) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)

            const result = yield* sql<Receipt.Encoded>`
              SELECT * FROM receipts
              WHERE receipt_number >= ${start_number}
                AND receipt_number <= ${end_number}
              ORDER BY receipt_number ASC
            `

            return result.map((receipt) => Schema.decodeSync(Receipt)(receipt))
          }).pipe(Effect.mapError(mapDatabaseError)),

        // Tax and compliance
        getReceiptsForPeriod: (fromDate: Date, toDate: Date) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)

            const result = yield* sql<Receipt.Encoded>`
              SELECT * FROM receipts
              WHERE issued_at >= ${fromDate}
                AND issued_at <= ${toDate}
              ORDER BY issued_at ASC
            `

            return result.map((receipt) => Schema.decodeSync(Receipt)(receipt))
          }).pipe(Effect.mapError(mapDatabaseError)),

        getReceiptTotalsForPeriod: (fromDate: Date, toDate: Date) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)

            const result = yield* sql<{
              total_receipts: number | string | null
              total_amount: number | string | null
              currencies: unknown
              tax_breakdown: unknown
            }>`
              WITH period_receipts AS (
                SELECT
                  purchase_snapshot,
                  merchant_config_snapshot
                FROM receipts
                WHERE issued_at >= ${fromDate}
                  AND issued_at <= ${toDate}
              ),
              totals AS (
                SELECT
                  COUNT(*) as total_receipts,
                  COALESCE(SUM((purchase_snapshot->>'amount')::decimal), 0) as total_amount
                FROM period_receipts
                WHERE purchase_snapshot->>'amount' IS NOT NULL
              ),
              currency_totals AS (
                SELECT
                  purchase_snapshot->>'currency' as currency,
                  SUM((purchase_snapshot->>'amount')::decimal) as total
                FROM period_receipts
                WHERE purchase_snapshot->>'currency' IS NOT NULL
                  AND purchase_snapshot->>'amount' IS NOT NULL
                GROUP BY purchase_snapshot->>'currency'
              ),
              tax_items AS (
                SELECT
                  COALESCE(tax_element->>'type', merchant_config_snapshot->>'tax_regime') as tax_type,
                  COALESCE((tax_element->>'amount')::decimal, 0) as amount
                FROM period_receipts
                LEFT JOIN LATERAL jsonb_array_elements(
                  COALESCE(purchase_snapshot->'tax_breakdown', '[]'::jsonb)
                ) AS tax_element ON TRUE
              ),
              tax_totals AS (
                SELECT
                  tax_type,
                  SUM(amount) as total
                FROM tax_items
                WHERE tax_type IS NOT NULL
                GROUP BY tax_type
              )
              SELECT
                (SELECT total_receipts FROM totals) as total_receipts,
                (SELECT total_amount FROM totals) as total_amount,
                COALESCE(
                  (SELECT jsonb_agg(jsonb_build_object('currency', currency, 'total', total)) FROM currency_totals),
                  '[]'::jsonb
                ) as currencies,
                COALESCE(
                  (SELECT jsonb_agg(jsonb_build_object('tax_type', tax_type, 'total', total)) FROM tax_totals),
                  '[]'::jsonb
                ) as tax_breakdown
            `

            const row = result[0]

            const toNumber = (value: unknown): number => {
              if (typeof value === "number") {
                return value
              }
              if (typeof value === "string" && value.trim().length > 0) {
                const parsed = Number(value)
                return Number.isNaN(parsed) ? 0 : parsed
              }
              return 0
            }

            const toArray = (value: unknown): Array<any> => {
              if (!value) {
                return []
              }
              if (Array.isArray(value)) {
                return value
              }
              if (typeof value === "string") {
                try {
                  const parsed = JSON.parse(value)
                  return Array.isArray(parsed) ? parsed : []
                } catch {
                  return []
                }
              }
              return []
            }

            const currencies = toArray(row?.currencies).map((entry) => ({
              currency: typeof entry?.currency === "string" ? entry.currency : "",
              total: toNumber(entry?.total)
            })).filter((entry) => entry.currency.length > 0)

            const taxBreakdown = toArray(row?.tax_breakdown).map((entry) => ({
              tax_type: typeof entry?.tax_type === "string" ? entry.tax_type : "",
              total: toNumber(entry?.total)
            })).filter((entry) => entry.tax_type.length > 0)

            return {
              total_receipts: toNumber(row?.total_receipts),
              total_amount: toNumber(row?.total_amount),
              currencies,
              tax_breakdown: taxBreakdown
            }
          }).pipe(Effect.mapError(mapDatabaseError)),

        // Data integrity
        validateReceiptIntegrity: (receipt_id: string) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)

            const result = yield* sql<{
              valid: boolean
              lot_exists: boolean
              purchase_snapshot_complete: boolean
              merchant_config_complete: boolean
            }>`
              WITH receipt_check AS (
                SELECT
                  r.*,
                  EXISTS(
                    SELECT 1 FROM ledger_entries le
                    WHERE le.entry_id = r.lot_id
                      AND le.created_month = r.lot_created_month
                  ) as lot_exists
                FROM receipts r
                WHERE r.receipt_id = ${receipt_id}
              )
              SELECT
                CASE
                  WHEN receipt_id IS NULL THEN false
                  ELSE true
                END as valid,
                COALESCE(lot_exists, false) as lot_exists,
                CASE
                  WHEN purchase_snapshot ? 'product_code'
                    AND purchase_snapshot ? 'amount'
                    AND purchase_snapshot ? 'currency'
                  THEN true
                  ELSE false
                END as purchase_snapshot_complete,
                CASE
                  WHEN merchant_config_snapshot ? 'legal_name'
                  THEN true
                  ELSE false
                END as merchant_config_complete
              FROM receipt_check
              LIMIT 1
            `

            const row = result[0]
            return {
              valid: row?.valid ?? false,
              lot_exists: row?.lot_exists ?? false,
              purchase_snapshot_complete: row?.purchase_snapshot_complete ?? false,
              merchant_config_complete: row?.merchant_config_complete ?? false
            }
          }).pipe(Effect.mapError(mapDatabaseError))
      }
    })
  }
) {}
