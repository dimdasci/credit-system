import { Schema } from "@effect/schema"
import { UserId } from "../../shared/values/UserId.js"

// Operation status enumeration matching database constraints
export const OperationStatus = Schema.Literal("open", "completed", "expired", "cancelled")

// Operation entity for two-phase credit consumption protocol
export class Operation extends Schema.Class<Operation>("Operation")({
  operation_id: Schema.UUID,
  user_id: UserId,
  operation_type_code: Schema.String, // References operation_types(operation_code)
  workflow_id: Schema.optional(Schema.UUID),
  captured_rate: Schema.Number.pipe(Schema.positive()), // decimal(19,6)
  status: OperationStatus,
  opened_at: Schema.Date,
  expires_at: Schema.Date,
  closed_at: Schema.optional(Schema.Date)
}) {
  // Business logic methods
  isOpen(): boolean {
    return this.status === "open"
  }

  isClosed(): boolean {
    return this.status === "completed"
  }

  isExpired(): boolean {
    return this.status === "expired" ||
      (this.status === "open" && this.expires_at < new Date())
  }

  canBeClosed(): boolean {
    return this.status === "open" && !this.isExpired()
  }

  calculateCreditsConsumed(resourceAmount: number): number {
    return resourceAmount * this.captured_rate
  }
}

export namespace Operation {
  export type Encoded = Schema.Schema.Encoded<typeof Operation>
  export type Context = Schema.Schema.Context<typeof Operation>
}

// Type guards for operation states
export const OpenOperation = Operation.pipe(
  Schema.filter((op): op is Operation => op.status === "open")
)

export const CompletedOperation = Operation.pipe(
  Schema.filter((op): op is Operation => op.status === "completed" && op.closed_at !== undefined)
)
