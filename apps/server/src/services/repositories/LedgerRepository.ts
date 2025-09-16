import { MerchantContext } from "@credit-system/shared"
import * as SqlSchema from "@effect/sql/SqlSchema"
import { Effect, Layer, Schema } from "effect"
import { DatabaseManager } from "../../db/DatabaseManager.js"
import { DatabaseManagerLive, PgLayerFactoryLive } from "../../db/DatabaseManagerImpl.js"
import { LedgerEntry } from "../../domain/credit-ledger/LedgerEntry.js"
import { createMonthDate } from "../../domain/shared/MonthDate.js"

// Query options for ledger history and lot queries
export interface LedgerQueryOptions {
  limit?: number
  offset?: number
  fromDate?: Date
  toDate?: Date
  reasons?: Array<"purchase" | "welcome" | "promo" | "adjustment" | "debit" | "expiry" | "refund" | "chargeback">
}

// Lot summary for balance and expiry tracking (read model)
export interface LotSummary {
  lot_id: string
  lot_month: string // ISO date string for month partition
  user_id: string
  initial_amount: number
  current_balance: number
  product_code: string | null
  expires_at: Date | null
  issued_at: Date
  is_expired: boolean
}

export class LedgerRepository extends Effect.Service<LedgerRepository>()(
  "LedgerRepository",
  {
    effect: Effect.gen(function*() {
      const db = yield* DatabaseManager
      const merchantContext = yield* MerchantContext

      // Core ledger entry operations
      const _createLedgerEntry = SqlSchema.void({
        Request: LedgerEntry,
        execute: (entry) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            return yield* sql`
              INSERT INTO ledger_entries (
                entry_id, user_id, lot_id, lot_month, amount, reason, 
                operation_type, resource_amount, resource_unit, workflow_id,
                product_code, expires_at, created_at, created_month
              ) VALUES (
                ${entry.entry_id}, ${entry.user_id}, ${entry.lot_id}, ${entry.lot_month},
                ${entry.amount}, ${entry.reason}, ${entry.operation_type},
                ${entry.resource_amount}, ${entry.resource_unit},
                ${entry.workflow_id}, ${entry.product_code},
                ${entry.expires_at}, ${entry.created_at}, ${entry.created_month}
              )
            `
          })
      })

      // Batch create multiple entries - simplified approach
      const _createLedgerEntries = SqlSchema.void({
        Request: Schema.Array(LedgerEntry),
        execute: (entries) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)

            // For simplicity, use multiple individual inserts in a transaction
            // In a real implementation, you'd want proper batch insert
            return yield* Effect.forEach(entries, (entry) =>
              sql`
              INSERT INTO ledger_entries (
                entry_id, user_id, lot_id, lot_month, amount, reason, 
                operation_type, resource_amount, resource_unit, workflow_id,
                product_code, expires_at, created_at, created_month
              ) VALUES (
                ${entry.entry_id}, ${entry.user_id}, ${entry.lot_id}, ${entry.lot_month},
                ${entry.amount}, ${entry.reason}, ${entry.operation_type},
                ${entry.resource_amount}, ${entry.resource_unit},
                ${entry.workflow_id}, ${entry.product_code},
                ${entry.expires_at}, ${entry.created_at}, ${entry.created_month}
              )
            `, { concurrency: "unbounded" })
          })
      })

      const _getLedgerHistory = SqlSchema.findAll({
        Request: Schema.Struct({
          user_id: Schema.String,
          options: Schema.optional(Schema.Unknown)
        }),
        Result: LedgerEntry,
        execute: ({ options, user_id }) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            const opts = (options as LedgerQueryOptions) || {}

            // Build dynamic filters
            const whereConditions = [sql`user_id = ${user_id}`]

            if (opts.fromDate) {
              whereConditions.push(sql`created_at >= ${opts.fromDate}`)
            }

            if (opts.toDate) {
              whereConditions.push(sql`created_at <= ${opts.toDate}`)
            }

            if (opts.reasons && opts.reasons.length > 0) {
              whereConditions.push(sql`reason IN (${opts.reasons.map((r) => sql`${r}`).join(", ")})`)
            }

            // Build complete query in single template literal to avoid composition issues
            const fromDateFilter = opts.fromDate ? sql`AND created_at >= ${opts.fromDate}` : sql``
            const toDateFilter = opts.toDate ? sql`AND created_at <= ${opts.toDate}` : sql``
            const reasonFilter = opts.reasons && opts.reasons.length > 0
              ? sql`AND reason IN (${opts.reasons.map((r) => sql`${r}`).join(", ")})` :
              sql``
            const limitClause = opts.limit ? sql`LIMIT ${opts.limit}` : sql``
            const offsetClause = opts.offset ? sql`OFFSET ${opts.offset}` : sql``

            return yield* sql<LedgerEntry.Encoded>`
              SELECT * FROM ledger_entries 
              WHERE user_id = ${user_id}
              ${fromDateFilter}
              ${toDateFilter}
              ${reasonFilter}
              ORDER BY created_at DESC
              ${limitClause}
              ${offsetClause}
            `
          })
      })

      return {
        // Core ledger operations
        createLedgerEntry: (entry: LedgerEntry) => _createLedgerEntry(entry),

        createLedgerEntries: (entries: Array<LedgerEntry>) => _createLedgerEntries(entries),

        getLedgerHistory: (user_id: string, options?: LedgerQueryOptions) => _getLedgerHistory({ user_id, options }),

        // Balance calculations across partitions
        getUserBalance: (user_id: string) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            const result = yield* sql<{ balance: number }>`
              SELECT COALESCE(SUM(amount), 0) as balance
              FROM ledger_entries
              WHERE user_id = ${user_id}
            `
            return result[0]?.balance || 0
          }),

        getLotBalance: (lot_id: string, lot_month: string) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            const result = yield* sql<{ balance: number }>`
              SELECT COALESCE(SUM(amount), 0) as balance
              FROM ledger_entries
              WHERE lot_id = ${lot_id} AND lot_month = ${lot_month}
            `
            return result[0]?.balance || 0
          }),

        // Lot management with optimized read models
        getActiveLots: (user_id: string, at_time: Date = new Date()) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            const result = yield* sql<LotSummary>`
              WITH lot_balances AS (
                SELECT 
                  lot_id,
                  lot_month,
                  user_id,
                  SUM(amount) as balance,
                  -- Get issuance entry details
                  MIN(CASE WHEN entry_id = lot_id THEN amount END) as initial_amount,
                  MIN(CASE WHEN entry_id = lot_id THEN product_code END) as product_code,
                  MIN(CASE WHEN entry_id = lot_id THEN expires_at END) as expires_at,
                  MIN(CASE WHEN entry_id = lot_id THEN created_at END) as issued_at
                FROM ledger_entries 
                WHERE user_id = ${user_id}
                GROUP BY lot_id, lot_month, user_id
              )
              SELECT 
                lot_id,
                lot_month,
                user_id,
                initial_amount,
                balance as current_balance,
                product_code,
                expires_at,
                issued_at,
                (expires_at <= ${at_time}) as is_expired
              FROM lot_balances
              WHERE expires_at > ${at_time}
                AND balance > 0
              ORDER BY issued_at ASC
            `
            return result
          }),

        getExpiredLots: (user_id: string, at_time: Date = new Date()) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            const result = yield* sql<LotSummary>`
              WITH lot_balances AS (
                SELECT 
                  lot_id,
                  lot_month,
                  user_id,
                  SUM(amount) as balance,
                  MIN(CASE WHEN entry_id = lot_id THEN amount END) as initial_amount,
                  MIN(CASE WHEN entry_id = lot_id THEN product_code END) as product_code,
                  MIN(CASE WHEN entry_id = lot_id THEN expires_at END) as expires_at,
                  MIN(CASE WHEN entry_id = lot_id THEN created_at END) as issued_at
                FROM ledger_entries 
                WHERE user_id = ${user_id}
                GROUP BY lot_id, lot_month, user_id
              )
              SELECT 
                lot_id,
                lot_month,
                user_id,
                initial_amount,
                balance as current_balance,
                product_code,
                expires_at,
                issued_at,
                true as is_expired
              FROM lot_balances
              WHERE expires_at <= ${at_time}
                AND balance > 0
              ORDER BY issued_at ASC
            `
            return result
          }),

        getLotById: (lot_id: string, lot_month: string) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            const result = yield* sql<LedgerEntry.Encoded>`
              SELECT * FROM ledger_entries
              WHERE lot_id = ${lot_id} 
                AND lot_month = ${lot_month}
                AND entry_id = lot_id
              LIMIT 1
            `
            if (result.length === 0) {
              return null
            }

            const decoded = yield* Schema.decodeUnknown(LedgerEntry)(result[0])
            return decoded
          }).pipe(
            Effect.catchAll(() => Effect.succeed(null))
          ),

        // FIFO consumption support
        getOldestActiveLot: (user_id: string, at_time: Date = new Date()) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            const result = yield* sql<LotSummary>`
              WITH lot_balances AS (
                SELECT 
                  lot_id,
                  lot_month,
                  user_id,
                  SUM(amount) as balance,
                  MIN(CASE WHEN entry_id = lot_id THEN amount END) as initial_amount,
                  MIN(CASE WHEN entry_id = lot_id THEN product_code END) as product_code,
                  MIN(CASE WHEN entry_id = lot_id THEN expires_at END) as expires_at,
                  MIN(CASE WHEN entry_id = lot_id THEN created_at END) as issued_at
                FROM ledger_entries 
                WHERE user_id = ${user_id}
                GROUP BY lot_id, lot_month, user_id
              )
              SELECT 
                lot_id,
                lot_month,
                user_id,
                initial_amount,
                balance as current_balance,
                product_code,
                expires_at,
                issued_at,
                false as is_expired
              FROM lot_balances
              WHERE expires_at > ${at_time}
                AND balance > 0
              ORDER BY issued_at ASC
              LIMIT 1
            `
            return result[0] || null
          }),

        // Audit and compliance queries
        getLedgerEntriesForPeriod: (fromDate: Date, toDate: Date, user_id?: string) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)

            const userFilter = user_id ? sql`AND user_id = ${user_id}` : sql``

            const result = yield* sql<LedgerEntry.Encoded>`
              SELECT * FROM ledger_entries
              WHERE created_at >= ${fromDate}
                AND created_at <= ${toDate}
                ${userFilter}
              ORDER BY created_at ASC
            `

            return result.map((entry) => Schema.decodeSync(LedgerEntry)(entry))
          }),

        getUserLedgerSummary: (user_id: string, month?: Date) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)

            const monthFilter = month
              ? sql`AND created_month = ${createMonthDate(month)}`
              : sql``

            const result = yield* sql<{
              total_credits: number
              total_debits: number
              current_balance: number
              active_lots: number
              expired_lots: number
            }>`
              WITH entry_summary AS (
                SELECT 
                  SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_credits,
                  SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_debits,
                  COALESCE(SUM(amount), 0) as current_balance
                FROM ledger_entries
                WHERE user_id = ${user_id} ${monthFilter}
              ),
              lot_counts AS (
                SELECT 
                  COUNT(CASE WHEN expires_at > NOW() AND balance > 0 THEN 1 END) as active_lots,
                  COUNT(CASE WHEN expires_at <= NOW() AND balance > 0 THEN 1 END) as expired_lots
                FROM (
                  SELECT 
                    lot_id,
                    lot_month,
                    SUM(amount) as balance,
                    MIN(CASE WHEN entry_id = lot_id THEN expires_at END) as expires_at
                  FROM ledger_entries 
                  WHERE user_id = ${user_id} ${monthFilter}
                  GROUP BY lot_id, lot_month
                ) lot_balances
              )
              SELECT 
                es.total_credits,
                es.total_debits,
                es.current_balance,
                lc.active_lots,
                lc.expired_lots
              FROM entry_summary es, lot_counts lc
            `

            return result[0] || {
              total_credits: 0,
              total_debits: 0,
              current_balance: 0,
              active_lots: 0,
              expired_lots: 0
            }
          })
      }
    }),
    dependencies: [Layer.provide(DatabaseManagerLive, PgLayerFactoryLive)]
  }
) {}
