import type { Effect } from "effect"
import { Context } from "effect"
import type { DomainError } from "../../shared/DomainErrors.js"
import type { LedgerEntry } from "../LedgerEntry.js"

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

// Repository interface for ledger entry management
export interface LedgerRepository {
  // Core ledger operations
  createLedgerEntry: (entry: LedgerEntry) => Effect.Effect<void, DomainError>
  getLedgerHistory: (user_id: string, options?: LedgerQueryOptions) => Effect.Effect<Array<LedgerEntry>, DomainError>

  // Balance calculations
  getUserBalance: (user_id: string) => Effect.Effect<number, DomainError>
  getLotBalance: (lot_id: string, lot_month: string) => Effect.Effect<number, DomainError>

  // Lot management (issuance entries)
  getActiveLots: (user_id: string, at_time?: Date) => Effect.Effect<Array<LotSummary>, DomainError>
  getExpiredLots: (user_id: string, at_time?: Date) => Effect.Effect<Array<LotSummary>, DomainError>
  getLotById: (lot_id: string, lot_month: string) => Effect.Effect<LedgerEntry | null, DomainError>

  // FIFO consumption support
  getOldestActiveLot: (user_id: string, at_time?: Date) => Effect.Effect<LotSummary | null, DomainError>

  // Batch operations for performance
  createLedgerEntries: (entries: Array<LedgerEntry>) => Effect.Effect<void, DomainError>

  // Audit and compliance
  getLedgerEntriesForPeriod: (
    fromDate: Date,
    toDate: Date,
    user_id?: string
  ) => Effect.Effect<Array<LedgerEntry>, DomainError>
  getUserLedgerSummary: (user_id: string, month?: Date) => Effect.Effect<{
    total_credits: number
    total_debits: number
    current_balance: number
    active_lots: number
    expired_lots: number
  }, DomainError>
}

// Context tag for dependency injection
export const LedgerRepository = Context.GenericTag<LedgerRepository>("LedgerRepository")
