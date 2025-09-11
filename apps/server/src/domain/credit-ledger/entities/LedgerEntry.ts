import { Schema } from "@effect/schema"
import { MonthDate } from "../../shared/values/MonthDate.js"
import { UserId } from "../../shared/values/UserId.js"

// Ledger entry reason enumeration matching database constraints
export const LedgerReason = Schema.Literal(
  "purchase",
  "welcome",
  "promo",
  "adjustment",
  "debit",
  "expiry",
  "refund",
  "chargeback"
)

export class LedgerEntry extends Schema.Class<LedgerEntry>("LedgerEntry")({
  entry_id: Schema.UUID,
  user_id: UserId,
  lot_id: Schema.UUID,
  lot_month: MonthDate, // date_trunc('month', ...) result
  amount: Schema.Number.pipe(Schema.int()), // PostgreSQL integer, not decimal
  reason: LedgerReason,
  operation_type: Schema.String,
  resource_amount: Schema.optional(Schema.Number), // decimal(19,4)
  resource_unit: Schema.optional(Schema.String),
  workflow_id: Schema.optional(Schema.UUID),
  // Issuance context (only on initial credit entries)
  product_code: Schema.optional(Schema.String),
  expires_at: Schema.optional(Schema.Date), // timestamptz
  created_at: Schema.Date, // timestamptz
  created_month: MonthDate // date_trunc('month', created_at) partition key
}) {
  // Business logic methods
  isIssuanceEntry(): boolean {
    return this.amount > 0 &&
      this.product_code !== undefined &&
      this.expires_at !== undefined &&
      this.lot_id === this.entry_id &&
      this.lot_month === this.created_month
  }

  isDebitEntry(): boolean {
    return this.amount <= 0 &&
      this.product_code === undefined &&
      this.expires_at === undefined
  }
}

export namespace LedgerEntry {
  export type Encoded = Schema.Schema.Encoded<typeof LedgerEntry>
  export type Context = Schema.Schema.Context<typeof LedgerEntry>
}

// Type guards for entry types
export const CreditEntry = LedgerEntry.pipe(
  Schema.filter((entry): entry is LedgerEntry => entry.amount > 0)
)

export const DebitEntry = LedgerEntry.pipe(
  Schema.filter((entry): entry is LedgerEntry => entry.amount <= 0)
)
