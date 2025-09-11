import { Schema } from "@effect/schema"

// 1. ProductUnavailable
// Business Scenario: User attempts to purchase a product that cannot be sold right now
export class ProductUnavailable extends Schema.TaggedError<ProductUnavailable>("ProductUnavailable")(
  "ProductUnavailable",
  {
    product_code: Schema.String,
    country: Schema.optional(Schema.String),
    reason: Schema.Literal(
      "not_found",
      "archived", 
      "not_available_in_country",
      "pricing_changed"
    )
  }
) {
  toString(): string {
    switch (this.reason) {
      case "not_found":
        return `Product ${this.product_code} not found in catalog`
      case "archived":
        return `Product ${this.product_code} is no longer available`
      case "not_available_in_country":
        return `Product ${this.product_code} is not available in ${this.country || "your country"}`
      case "pricing_changed":
        return `Pricing for ${this.product_code} has changed since checkout`
      default:
        return `Product ${this.product_code} is unavailable`
    }
  }
}

// 2. OperationUnavailable  
// Business Scenario: User attempts to start an operation but service cannot accommodate the request right now
export class OperationUnavailable extends Schema.TaggedError<OperationUnavailable>("OperationUnavailable")(
  "OperationUnavailable",
  {
    user_id: Schema.String,
    operation_type_code: Schema.optional(Schema.String),
    reason: Schema.Literal(
      "already_has_open_operation",
      "operation_type_inactive",
      "service_temporarily_disabled"
    )
  }
) {
  toString(): string {
    switch (this.reason) {
      case "already_has_open_operation":
        return `User already has an active operation. Please complete or wait for expiry before starting a new one.`
      case "operation_type_inactive":
        return `Operation type ${this.operation_type_code} is currently inactive`
      case "service_temporarily_disabled":
        return `Operation service is temporarily disabled`
      default:
        return `Operation is currently unavailable`
    }
  }
}

// 3. InsufficientBalance
// Business Scenario: User attempts to start an operation but doesn't have enough credits
export class InsufficientBalance extends Schema.TaggedError<InsufficientBalance>("InsufficientBalance")(
  "InsufficientBalance", 
  {
    user_id: Schema.String,
    current_balance: Schema.Number,
    reason: Schema.Literal(
      "negative_balance",
      "no_active_lots"
    )
  }
) {
  toString(): string {
    switch (this.reason) {
      case "negative_balance":
        return `Insufficient balance: ${this.current_balance} credits. Please purchase more credits.`
      case "no_active_lots":
        return `No active credit lots available for consumption`
      default:
        return `Insufficient balance to start operation`
    }
  }
}

// 4. DuplicateAdminAction
// Business Scenario: Administrator attempts an action that was already completed
export class DuplicateAdminAction extends Schema.TaggedError<DuplicateAdminAction>("DuplicateAdminAction")(
  "DuplicateAdminAction",
  {
    action_type: Schema.Literal(
      "grant",
      "credit_adjustment", 
      "debit_adjustment",
      "product_creation",
      "refund",
      "chargeback"
    ),
    external_ref: Schema.optional(Schema.String),
    original_timestamp: Schema.Date
  }
) {
  toString(): string {
    return `${this.action_type} was already completed at ${this.original_timestamp.toISOString()}${this.external_ref ? ` (ref: ${this.external_ref})` : ""}`
  }
}

// 5. InvalidRequest
// Business Scenario: Request contains invalid data that prevents processing
export class InvalidRequest extends Schema.TaggedError<InvalidRequest>("InvalidRequest")(
  "InvalidRequest",
  {
    field: Schema.optional(Schema.String),
    reason: Schema.Literal(
      "resource_unit_mismatch",
      "invalid_amount",
      "workflow_id_mismatch", 
      "invalid_parameters",
      "format_violation"
    ),
    details: Schema.optional(Schema.String)
  }
) {
  toString(): string {
    const fieldPrefix = this.field ? `${this.field}: ` : ""
    const detailsSuffix = this.details ? ` (${this.details})` : ""
    
    switch (this.reason) {
      case "resource_unit_mismatch":
        return `${fieldPrefix}Resource unit does not match operation type specification${detailsSuffix}`
      case "invalid_amount":
        return `${fieldPrefix}Invalid amount - must be positive and within acceptable range${detailsSuffix}`
      case "workflow_id_mismatch":
        return `${fieldPrefix}Workflow ID mismatch between operation phases${detailsSuffix}`
      case "invalid_parameters":
        return `${fieldPrefix}Invalid input parameters${detailsSuffix}`
      case "format_violation":
        return `${fieldPrefix}Request format violation${detailsSuffix}`
      default:
        return `${fieldPrefix}Invalid request${detailsSuffix}`
    }
  }
}

// 6. AuthorizationRequired
// Business Scenario: Actor lacks permission for requested operation
export class AuthorizationRequired extends Schema.TaggedError<AuthorizationRequired>("AuthorizationRequired")(
  "AuthorizationRequired",
  {
    operation: Schema.String,
    reason: Schema.Literal(
      "unauthorized_grant",
      "unauthorized_adjustment",
      "unauthorized_refund", 
      "unauthorized_catalog_change",
      "invalid_token",
      "expired_token"
    )
  }
) {
  toString(): string {
    switch (this.reason) {
      case "unauthorized_grant":
        return `Unauthorized to perform grant operations`
      case "unauthorized_adjustment":
        return `Unauthorized to perform credit adjustments`
      case "unauthorized_refund":
        return `Unauthorized to perform refunds`
      case "unauthorized_catalog_change":
        return `Unauthorized to modify product catalog`
      case "invalid_token":
        return `Invalid authentication token`
      case "expired_token":
        return `Authentication token has expired`
      default:
        return `Authorization required for ${this.operation}`
    }
  }
}

// 7. ServiceUnavailable
// Business Scenario: System cannot process request due to infrastructure issues
export class ServiceUnavailable extends Schema.TaggedError<ServiceUnavailable>("ServiceUnavailable")(
  "ServiceUnavailable",
  {
    service: Schema.optional(Schema.String),
    reason: Schema.Literal(
      "database_connection_failure",
      "transaction_timeout",
      "concurrent_update_conflict",
      "external_service_down",
      "resource_exhaustion"
    ),
    retry_after_seconds: Schema.optional(Schema.Number)
  }
) {
  toString(): string {
    const servicePrefix = this.service ? `${this.service}: ` : ""
    const retryInfo = this.retry_after_seconds ? ` Retry after ${this.retry_after_seconds} seconds.` : ""
    
    switch (this.reason) {
      case "database_connection_failure":
        return `${servicePrefix}Database connection failed.${retryInfo}`
      case "transaction_timeout":
        return `${servicePrefix}Transaction timed out due to high load.${retryInfo}`
      case "concurrent_update_conflict":
        return `${servicePrefix}Concurrent update conflict detected.${retryInfo}`
      case "external_service_down":
        return `${servicePrefix}External service dependency is unavailable.${retryInfo}`
      case "resource_exhaustion":
        return `${servicePrefix}System resources temporarily exhausted.${retryInfo}`
      default:
        return `${servicePrefix}Service temporarily unavailable.${retryInfo}`
    }
  }
}

// Union type for all domain errors
export type DomainError = 
  | ProductUnavailable
  | OperationUnavailable  
  | InsufficientBalance
  | DuplicateAdminAction
  | InvalidRequest
  | AuthorizationRequired
  | ServiceUnavailable