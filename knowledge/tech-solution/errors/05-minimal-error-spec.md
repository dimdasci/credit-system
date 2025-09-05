# Step 5: Minimal Error Set Specification

## Purpose
Design the final consolidated error types with their specific context requirements, message patterns, and handling behaviors for the Credit Management Service.

## Design Principles

### Effect Tagged Error Integration
- Each error type maps to Effect tagged error with type safety
- Errors provide sufficient context for recovery decisions
- Message templates support internationalization if needed
- Error context supports both user messaging and debugging

### Business-Aligned Error Types
- Errors match actual business scenarios, not technical implementation details
- Each error type has distinct recovery path and user guidance
- Context includes minimum viable information for resolution
- Error messages use business terminology, not technical jargon

## Minimal Error Set Specification

### 1. ProductUnavailable

**Business Scenario:** User attempts to purchase a product that cannot be sold right now

**Technical Triggers:**
- Product doesn't exist in catalog
- Product is archived 
- Product not available in user's country
- Pricing information has changed since checkout


**Message Template:**
- **User-Facing:** "This product is currently unavailable. Please try a different option."
- **Debug Context:** "Product {product_code} unavailable: {reason}"

**Recovery Guidance:**
- User should select different product from catalog
- Upstream app should refresh product catalog and retry
- For pricing changes: re-fetch current pricing and retry with updated snapshot

**Effect Implementation:**
```typescript
class ProductUnavailable extends Data.TaggedError("ProductUnavailable")<{
  readonly product_code: string
  readonly reason: "not_found" | "archived" | "geographic_restriction" | "pricing_changed"
  readonly merchant_id: string
  readonly requested_country?: string
  readonly alternative_products?: readonly string[]
}> {}
```

---

### 2. OperationUnavailable

**Business Scenario:** User attempts to start an operation but service cannot accommodate the request right now

**Technical Triggers:**
- User already has an active operation
- Operation type is inactive/archived
- Service is temporarily disabled


**Message Template:**
- **User-Facing:** "Operation cannot start right now. Please wait and try again."
- **With Current Operation:** "You have an active {operation_type} operation. Please complete it before starting a new one."
- **Debug Context:** "Operation {operation_type_code} unavailable for user {user_id}: {reason}"

**Recovery Guidance:**
- **User Busy:** Wait for current operation to complete or expire
- **Service Unavailable:** Retry after suggested delay
- **Operation Type Inactive:** Use different operation type or wait for service restoration

**Effect Implementation:**
```typescript
class OperationUnavailable extends Data.TaggedError("OperationUnavailable")<{
  readonly user_id: string
  readonly operation_type_code: string
  readonly reason: "user_busy" | "service_unavailable" | "operation_type_inactive"
  readonly merchant_id: string
  readonly retry_after?: number
  readonly current_operation?: {
    readonly operation_id: string
    readonly started_at: string
    readonly expires_at: string
    readonly operation_type: string
  }
}> {}
```

---

### 3. InsufficientBalance

**Business Scenario:** User attempts to start an operation but doesn't have enough credits

**Technical Triggers:**
- User balance < 0 when attempting Operation.Open
- No active credit lots available for consumption


**Message Template:**
- **User-Facing:** "Insufficient credits. Current balance: {current_balance} credits. Please add credits to continue."
- **With Estimation:** "Insufficient credits for {operation_type}. Current: {current_balance}, estimated cost: ~{estimated_cost} credits."
- **Debug Context:** "Insufficient balance for user {user_id}: {current_balance} credits"

**Recovery Guidance:**
- User must purchase more credits
- Provide direct link to purchase flow with suggested products
- Show current balance and estimated operation costs when possible

**Effect Implementation:**
```typescript
class InsufficientBalance extends Data.TaggedError("InsufficientBalance")<{
  readonly user_id: string
  readonly current_balance: number
  readonly merchant_id: string
  readonly operation_type_code: string
  readonly estimated_cost?: number
  readonly available_products?: readonly Array<{
    readonly product_code: string
    readonly title: string
    readonly credits: number
    readonly price: { readonly amount: number; readonly currency: string }
  }>
}> {}
```

---

### 4. DuplicateAdminAction

**Business Scenario:** Administrator attempts an action that was already completed (Priority 2 operations only)

**Technical Triggers:**
- Duplicate manual grants
- Duplicate credit/debit adjustments
- Duplicate product creation
- Duplicate refunds/chargebacks


**Message Template:**
- **Admin-Facing:** "This {action_type} was already completed on {original_timestamp}. Reference: {original_reference}"
- **Debug Context:** "Duplicate admin action {action_type} by {admin_actor}: original at {original_timestamp}"

**Recovery Guidance:**
- Admin should check existing records before retrying
- Provide reference to original action result
- No retry needed - original action already succeeded

**Effect Implementation:**
```typescript
class DuplicateAdminAction extends Data.TaggedError("DuplicateAdminAction")<{
  readonly action_type: "manual_grant" | "credit_adjustment" | "debit_adjustment" | "product_creation" | "refund" | "chargeback"
  readonly merchant_id: string
  readonly admin_actor: string
  readonly original_timestamp: string
  readonly original_reference: string
  readonly idempotency_key: string
}> {}
```

---

### 5. InvalidRequest

**Business Scenario:** Request contains invalid data that prevents processing

**Technical Triggers:**
- Resource unit mismatch
- Invalid resource amounts (negative, zero, excessive)  
- Workflow ID mismatch between operation phases
- Invalid input parameters (wrong data types, out of range values)
- Request format violations


**Message Template:**
- **Client-Facing:** "Invalid request format. Field '{field_name}' {validation_error}: expected {expected_format}"
- **Debug Context:** "Invalid request for {command_type}: {field_name} validation failed"

**Recovery Guidance:**
- Fix request data and retry
- Check API documentation for correct field formats  
- For integration issues: verify client-side validation logic
- Most of these should be caught during development, not production

**Effect Implementation:**
```typescript
class InvalidRequest extends Data.TaggedError("InvalidRequest")<{
  readonly field_name: string
  readonly validation_error: "type_mismatch" | "out_of_range" | "format_invalid" | "required_missing" | "consistency_violation"
  readonly provided_value: unknown
  readonly expected_format: string
  readonly merchant_id: string
  readonly command_type: string
}> {}
```

---

### 6. AuthorizationRequired

**Business Scenario:** Actor lacks permission for requested operation

**Technical Triggers:**
- Unauthorized admin attempting grants
- Unauthorized admin attempting adjustments
- Unauthorized admin attempting refunds
- Unauthorized admin attempting catalog changes
- Invalid or expired authentication tokens


**Message Template:**
- **Admin-Facing:** "Authorization required for this operation. Missing permission: {required_permission}"
- **Debug Context:** "Authorization failed for {actor_id}: missing {required_permission} for {operation_type}"

**Recovery Guidance:**
- Verify authentication token is valid and not expired
- Contact administrator to assign required permissions
- Check role assignments for current user
- Review merchant access policies

**Effect Implementation:**
```typescript
class AuthorizationRequired extends Data.TaggedError("AuthorizationRequired")<{
  readonly required_permission: string
  readonly actor_id: string
  readonly merchant_id: string
  readonly operation_type: string
  readonly current_role?: string
}> {}
```

---

### 7. ServiceUnavailable

**Business Scenario:** System cannot process request due to infrastructure issues

**Technical Triggers:**
- Database connection failures
- Transaction timeout/deadlocks
- Concurrent update conflicts
- External service dependencies down
- Resource exhaustion


**Message Template:**
- **User-Facing:** "Service temporarily unavailable. Please try again in a few moments."
- **With Retry:** "Service temporarily unavailable. Please retry in {retry_after} seconds."
- **Debug Context:** "Service unavailable ({error_type}) for {operation_type} in merchant {merchant_id}"

**Recovery Guidance:**
- Retry with exponential backoff
- Check service status page if available  
- For persistent failures: escalate to infrastructure team
- User should try again later

**Effect Implementation:**
```typescript
class ServiceUnavailable extends Data.TaggedError("ServiceUnavailable")<{
  readonly error_type: "database" | "network" | "concurrency" | "external_dependency" | "resource_exhaustion"
  readonly merchant_id: string
  readonly operation_type: string
  readonly retry_after?: number
  readonly incident_id?: string
}> {}
```

## Consolidated Error Union Type

```typescript
type CreditServiceError = 
  | ProductUnavailable
  | OperationUnavailable
  | InsufficientBalance
  | DuplicateAdminAction
  | InvalidRequest
  | AuthorizationRequired
  | ServiceUnavailable
```

## Error Hierarchy and Retry Policies

### Retriable Errors (with backoff)
- `ServiceUnavailable` - Always retriable with exponential backoff
- `OperationUnavailable` (reason: "service_unavailable") - Retriable with delay

### User-Actionable Errors (no automatic retry)
- `InsufficientBalance` - User must purchase credits
- `ProductUnavailable` - User must select different product
- `OperationUnavailable` (reason: "user_busy") - User must wait for current operation

### Fatal Errors (no retry)
- `InvalidRequest` - Request data must be fixed
- `AuthorizationRequired` - Permissions must be granted  
- `DuplicateAdminAction` - Action already completed successfully

## Context Completeness Validation

Each error type includes:
✅ **Identification**: What went wrong and where
✅ **Classification**: Why it happened (reason/error_type)
✅ **Context**: Relevant IDs and state information
✅ **Guidance**: How to resolve (implicit in error type and context)
✅ **Debugging**: Sufficient information for troubleshooting

## Message Localization Support

All message templates designed for:
- **Parameterization**: Use context values in messages  
- **Internationalization**: Template structure supports i18n
- **Consistent Tone**: Business-friendly language, not technical jargon
- **Actionable Guidance**: Clear next steps for users/admins

This minimal error set provides comprehensive coverage of all Credit Management Service failure scenarios while maintaining simplicity for client integration and consistent user experience.