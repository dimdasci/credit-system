import { Schema } from "@effect/schema"
import { Option } from "effect"

// Operation type entity for rate management with sequential versioning
export class OperationType extends Schema.Class<OperationType>("OperationType")({
  operation_code: Schema.String, // Primary key
  display_name: Schema.String.pipe(Schema.minLength(1)),
  resource_unit: Schema.String.pipe(Schema.minLength(1)),
  credits_per_unit: Schema.Number.pipe(Schema.positive()), // decimal(19,6)
  // Sequential Versioning
  effective_at: Schema.Date,
  archived_at: Schema.OptionFromNullOr(Schema.Date)
}) {
  // Business logic methods
  isActive(): boolean {
    const now = new Date()
    return this.effective_at <= now && Option.isNone(this.archived_at)
  }

  isArchived(): boolean {
    return Option.isSome(this.archived_at)
  }

  calculateCredits(resourceAmount: number): number {
    return resourceAmount * this.credits_per_unit
  }
}

export namespace OperationType {
  export type Encoded = Schema.Schema.Encoded<typeof OperationType>
  export type Context = Schema.Schema.Context<typeof OperationType>
}
