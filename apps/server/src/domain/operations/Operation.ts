import { UserId } from "@server/domain/shared/UserId.js"
import { Option, Schema } from "effect"

// Operation status enumeration matching database constraints
export const OperationStatus = Schema.Literal("open", "completed", "expired", "cancelled")

// Operation entity for two-phase credit consumption protocol
export class Operation extends Schema.Class<Operation>("Operation")({
  operation_id: Schema.UUID,
  user_id: UserId,
  operation_type_code: Schema.String, // References operation_types(operation_code)
  workflow_id: Schema.OptionFromNullOr(Schema.String),
  captured_rate: Schema.Number.pipe(Schema.positive()), // decimal(19,6)
  status: OperationStatus,
  opened_at: Schema.Date,
  expires_at: Schema.Date,
  closed_at: Schema.OptionFromNullOr(Schema.Date)
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
  Schema.filter((op): op is Operation => op.status === "completed" && Option.isSome((op as any).closed_at))
)

// Schema-level invariant: expires_at must be strictly after opened_at
export const OperationValidated = Operation.pipe(
  Schema.filter((op) => (op as any).expires_at > (op as any).opened_at)
)
