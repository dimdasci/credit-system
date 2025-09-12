import { Schema } from "@effect/schema"
import { Credits } from "@server/domain/shared/values/Credits.js"
import { MonthDate } from "@server/domain/shared/values/MonthDate.js"
import { UserId } from "@server/domain/shared/values/UserId.js"

// Lot is conceptually an alias for the initial credit entry
// There is no separate lots table - a "lot" IS a credit ledger entry
export class Lot extends Schema.Class<Lot>("Lot")({
  entry_id: Schema.UUID, // This becomes the lot_id for all related entries
  user_id: UserId,
  lot_month: MonthDate, // Same as created_month for the initial entry
  initial_amount: Credits.pipe(Schema.greaterThan(0)), // Original credit amount (positive)
  product_code: Schema.String,
  expires_at: Schema.Date,
  created_at: Schema.Date,
  created_month: MonthDate
}) {
  // Business logic methods
  isExpired(): boolean {
    return this.expires_at < new Date()
  }

  isValid(): boolean {
    return !this.isExpired()
  }
}

export namespace Lot {
  export type Encoded = Schema.Schema.Encoded<typeof Lot>
  export type Context = Schema.Schema.Context<typeof Lot>
}
