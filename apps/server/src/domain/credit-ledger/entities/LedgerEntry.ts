import { Schema } from "@effect/schema"
import { Credits } from "@server/domain/shared/values/Credits.js"
import { createMonthDate, MonthDate } from "@server/domain/shared/values/MonthDate.js"
import { UserId } from "@server/domain/shared/values/UserId.js"
import { Option } from "effect"

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
  amount: Credits, // Non-zero integer credits (can be positive or negative)
  reason: LedgerReason,
  operation_type: Schema.String,
  resource_amount: Schema.OptionFromNullOr(Schema.Number), // decimal(19,4)
  resource_unit: Schema.OptionFromNullOr(Schema.String),
  workflow_id: Schema.OptionFromNullOr(Schema.String),
  // Issuance context (only on initial credit entries)
  product_code: Schema.OptionFromNullOr(Schema.String),
  expires_at: Schema.OptionFromNullOr(Schema.Date), // timestamptz
  created_at: Schema.Date, // timestamptz
  created_month: MonthDate // date_trunc('month', created_at) partition key
}) {
  // Business logic methods
  isIssuanceEntry(): boolean {
    return this.amount > 0 &&
      Option.isSome(this.product_code) &&
      Option.isSome(this.expires_at) &&
      this.lot_id === this.entry_id &&
      this.lot_month === this.created_month
  }

  isDebitEntry(): boolean {
    return this.amount <= 0 &&
      Option.isNone(this.product_code) &&
      Option.isNone(this.expires_at)
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

// Schema-level invariants for issuance/debit role context
export const LedgerEntryValidated = LedgerEntry.pipe(
  Schema.filter((entry) => {
    const createdMonthFromDate = createMonthDate((entry as any).created_at as Date)
    const baseCheck = (entry as any).created_month === createdMonthFromDate

    if ((entry as any).amount > 0) {
      return baseCheck &&
        Option.isSome((entry as any).product_code) &&
        Option.isSome((entry as any).expires_at) &&
        (entry as any).lot_id === (entry as any).entry_id &&
        (entry as any).lot_month === (entry as any).created_month
    } else {
      return baseCheck &&
        Option.isNone((entry as any).product_code) &&
        Option.isNone((entry as any).expires_at)
    }
  })
)
