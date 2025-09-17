import { MerchantContext } from "@credit-system/shared"
import * as SqlSchema from "@effect/sql/SqlSchema"
import { Effect, Layer, Schema } from "effect"
import { randomUUID } from "node:crypto"
import { DatabaseManager } from "../../db/DatabaseManager.js"
import { DatabaseManagerLive, PgLayerFactoryLive } from "../../db/DatabaseManagerImpl.js"
import { LedgerEntry } from "../../domain/credit-ledger/LedgerEntry.js"
import { Lot } from "../../domain/credit-ledger/Lot.js"
import type { Product } from "../../domain/products/Product.js"
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

export interface CreditIssuanceContext {
  operation_type: string
  resource_amount?: number | null
  resource_unit?: string | null
  workflow_id?: string | null
  reason?: "purchase" | "welcome" | "promo" | "adjustment"
  settled_at?: Date
  created_at?: Date
  expires_at?: Date
}

export interface DebitRecordContext {
  operation_type: string
  amount: number
  resource_amount?: number | null
  resource_unit?: string | null
  workflow_id?: string | null
  reason?: "debit" | "expiry" | "refund" | "chargeback"
  created_at?: Date
}

export interface TargetLotReference {
  lot_id: string
  lot_month: string
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
            const createdAt = new Date(entry.created_at)
            const createdMonth = createMonthDate(createdAt)

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
                ${entry.expires_at}, ${createdAt}, ${createdMonth}
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
            return yield* Effect.forEach(entries, (entry) => {
              const createdAt = new Date(entry.created_at)
              const createdMonth = createMonthDate(createdAt)

              return sql`
              INSERT INTO ledger_entries (
                entry_id, user_id, lot_id, lot_month, amount, reason, 
                operation_type, resource_amount, resource_unit, workflow_id,
                product_code, expires_at, created_at, created_month
              ) VALUES (
                ${entry.entry_id}, ${entry.user_id}, ${entry.lot_id}, ${entry.lot_month},
                ${entry.amount}, ${entry.reason}, ${entry.operation_type},
                ${entry.resource_amount}, ${entry.resource_unit},
                ${entry.workflow_id}, ${entry.product_code},
                ${entry.expires_at}, ${createdAt}, ${createdMonth}
              )
            `
            }, { concurrency: "unbounded" })
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

            // Build complete query in single template literal to avoid composition issues
            const fromDateFilter = opts.fromDate ? sql`AND created_at >= ${opts.fromDate}` : sql``
            const toDateFilter = opts.toDate ? sql`AND created_at <= ${opts.toDate}` : sql``
            const fromMonthFilter = opts.fromDate ? sql`AND created_month >= ${createMonthDate(opts.fromDate)}` : sql``
            const toMonthFilter = opts.toDate ? sql`AND created_month <= ${createMonthDate(opts.toDate)}` : sql``
            const reasonFilter = opts.reasons && opts.reasons.length > 0
              ? sql`AND ${sql.in("reason", opts.reasons)}`
              : sql``
            const limitClause = opts.limit ? sql`LIMIT ${opts.limit}` : sql``
            const offsetClause = opts.offset ? sql`OFFSET ${opts.offset}` : sql``

            return yield* sql<LedgerEntry.Encoded>`
              SELECT * FROM ledger_entries 
              WHERE user_id = ${user_id}
              ${fromDateFilter}
              ${toDateFilter}
              ${fromMonthFilter}
              ${toMonthFilter}
              ${reasonFilter}
              ORDER BY created_at DESC
              ${limitClause}
              ${offsetClause}
            `
          })
      })

      const fetchActiveLotSummaries = (user_id: string, at_time: Date) =>
        Effect.gen(function*() {
          const sql = yield* db.getConnection(merchantContext.merchantId)
          return yield* sql<LotSummary>`
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
              (expires_at <= ${at_time}) as is_expired
            FROM lot_balances
            WHERE expires_at > ${at_time}
              AND balance > 0
            ORDER BY issued_at ASC, lot_id ASC
          `
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
        getActiveLots: (user_id: string, at_time: Date = new Date()) => fetchActiveLotSummaries(user_id, at_time),

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
            const result = yield* fetchActiveLotSummaries(user_id, at_time)
            return result[0] ?? null
          }),

        selectFIFOLots: (user_id: string, required_credits: number, at_time: Date = new Date()) =>
          Effect.gen(function*() {
            const summaries = yield* fetchActiveLotSummaries(user_id, at_time)

            let remaining = required_credits
            const selected: Array<Lot> = []

            for (const summary of summaries) {
              if (remaining <= 0) {
                break
              }

              if (!summary.product_code || summary.expires_at === null) {
                continue
              }

              const summaryLotMonth = createMonthDate(summary.issued_at)
              const lot = Schema.decodeSync(Lot)({
                entry_id: summary.lot_id,
                user_id: summary.user_id,
                lot_month: summaryLotMonth,
                initial_amount: summary.initial_amount,
                product_code: summary.product_code,
                expires_at: summary.expires_at.toISOString(),
                created_at: summary.issued_at.toISOString(),
                created_month: summaryLotMonth
              })

              selected.push(lot)
              remaining -= summary.current_balance
            }

            return selected
          }),

        createCreditLot: (
          user_id: string,
          product: Product,
          context: CreditIssuanceContext
        ): Effect.Effect<Lot, unknown> =>
          Effect.gen(function*() {
            const entryId = randomUUID()
            const createdAt = context.created_at ?? context.settled_at ?? new Date()
            const lotMonth = createMonthDate(createdAt)
            const expiresAt = context.expires_at ??
              new Date(createdAt.getTime() + product.access_period_days * 24 * 60 * 60 * 1000)
            const reason = context.reason ?? "purchase"

            const entry = Schema.decodeSync(LedgerEntry)({
              entry_id: entryId,
              user_id,
              lot_id: entryId,
              lot_month: lotMonth,
              amount: product.credits,
              reason,
              operation_type: context.operation_type,
              resource_amount: context.resource_amount ?? null,
              resource_unit: context.resource_unit ?? null,
              workflow_id: context.workflow_id ?? null,
              product_code: product.product_code,
              expires_at: expiresAt.toISOString(),
              created_at: createdAt.toISOString(),
              created_month: lotMonth
            })

            yield* _createLedgerEntry(entry)

            return Schema.decodeSync(Lot)({
              entry_id: entryId,
              user_id,
              lot_month: lotMonth,
              initial_amount: product.credits,
              product_code: product.product_code,
              expires_at: expiresAt.toISOString(),
              created_at: createdAt.toISOString(),
              created_month: lotMonth
            })
          }),

        recordDebit: (
          user_id: string,
          context: DebitRecordContext,
          target: TargetLotReference
        ): Effect.Effect<LedgerEntry, unknown> =>
          Effect.gen(function*() {
            const entryId = randomUUID()
            const createdAt = context.created_at ?? new Date()
            const createdMonth = createMonthDate(createdAt)
            const amount = context.amount <= 0 ? context.amount : -Math.abs(context.amount)
            const reason = context.reason ?? "debit"

            const entry = Schema.decodeSync(LedgerEntry)({
              entry_id: entryId,
              user_id,
              lot_id: target.lot_id,
              lot_month: target.lot_month,
              amount,
              reason,
              operation_type: context.operation_type,
              resource_amount: context.resource_amount ?? null,
              resource_unit: context.resource_unit ?? null,
              workflow_id: context.workflow_id ?? null,
              product_code: null,
              expires_at: null,
              created_at: createdAt.toISOString(),
              created_month: createdMonth
            })

            yield* _createLedgerEntry(entry)
            return entry
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
