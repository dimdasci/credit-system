# Step 4: Redundancy Analysis

## Purpose
Identify errors that are functionally equivalent from the end-user perspective and should be consolidated into single business-meaningful error types.

## Critical Correction: Idempotency is NOT an Error

**Domain Requirements Analysis:**
- **Priority 1 Operations** (Purchase.Settled, Operation.Open/RecordAndClose, Grant.Apply(welcome)): "Return the same final outcome" - duplicate requests return stored result as **successful response**, not error
- **Priority 2 Operations** (Admin actions): "Detect and reject duplicates" - duplicate requests return error message for operator retry

**Implication:** Only Priority 2 administrative duplicates are actual errors. Priority 1 duplicates are successful idempotent responses.

## Analysis Method
Group errors by **end-user impact** rather than technical root cause. Errors that result in the same user action or business outcome should be consolidated.

## Redundancy Groups

### Group 1: "Product Not Available" Errors
**Technical Errors:**
- `ProductNotFound`: Product code doesn't exist or is archived
- `ProductNotAvailable`: Product not available in snapshot country  
- `PricingMismatch`: Snapshot doesn't match current catalog pricing

**End-User Impact:** All result in "cannot purchase this product right now"
**User Action:** All require user to select different product or try later
**Business Outcome:** Purchase flow cannot continue with current product selection

**Consolidation Rationale:** From user perspective, these are all "product unavailable" - the technical distinction doesn't matter for user experience.

**Proposed Consolidated Error:** `ProductUnavailable`
- Context: product_code, reason (archived|geographic|pricing_changed)
- Message: "This product is currently unavailable. Please try a different option."

### Group 2: "Operation Cannot Start" Errors  
**Technical Errors:**
- `User has active operation`: Existing open operation prevents new one
- `Operation type not found`: Invalid or inactive operation type
- `Operation type inactive`: Operation type exists but archived

**End-User Impact:** All result in "cannot start new operation right now"
**User Action:** All require waiting or using different service feature
**Business Outcome:** Workflow cannot begin until condition resolves

**Consolidation Rationale:** User doesn't care about technical distinction - they can't start their operation and need to wait or try something else.

**Proposed Consolidated Error:** `OperationUnavailable`
- Context: reason (user_busy|service_unavailable), retry_after?, current_operation_info?
- Message: "Operation cannot start right now. Please wait and try again."

### Group 3: "Administrative Duplicates" Errors ✅ (Corrected scope)
**Technical Errors (Only Priority 2 - Admin Operations):**
- Duplicate administrative grants (manual)
- Duplicate credit/debit adjustments  
- Duplicate product creation attempts
- Duplicate refund attempts
- Duplicate chargeback attempts

**NOT Included (These are successful responses):**
- ~~Duplicate settlement~~ → Returns existing lot + receipt (Success)
- ~~Welcome grant already issued~~ → Returns existing grant (Success)  
- ~~Duplicate Operation.Open~~ → Returns existing operation_id (Success)

**End-User Impact:** Administrative action was already completed
**User Action:** Admin should check existing records or take no action
**Business Outcome:** Original admin action stands, no additional processing needed

**Consolidation Rationale:** Only administrative duplicates (Priority 2) are actual errors. Production-critical duplicates (Priority 1) return successful stored results.

**Proposed Consolidated Error:** `DuplicateAdminAction`
- Context: action_type, original_timestamp, existing_record_reference
- Message: "This administrative action was already completed on [timestamp]. Please check existing records."

### Group 4: "Invalid Request" Errors
**Technical Errors:**
- `Resource unit mismatch`: API integration bug
- `Invalid resource amount`: Negative or unreasonable values
- `Workflow ID mismatch`: Inconsistent workflow context
- `Invalid inputs` (various commands): Bad parameters
- `Negative credits` (credit adjustment): Wrong sign
- `Positive amount` (debit adjustment): Wrong sign

**End-User Impact:** All result in "request cannot be processed due to invalid data"
**User Action:** All require fixing the request or reporting integration issue
**Business Outcome:** Request rejected, no state changes

**Consolidation Rationale:** These are all client-side integration errors that should be caught during development, not runtime business logic.

**Proposed Consolidated Error:** `InvalidRequest`  
- Context: field_name, expected_format, provided_value
- Message: "Invalid request format. Please check the provided data."

### Group 5: "Authorization Required" Errors
**Technical Errors:**
- `Unauthorized caller` (grants): Admin not authorized for grants
- `Unauthorized caller` (adjustments): Admin not authorized for adjustments  
- `Insufficient authorization` (refund): Admin lacks refund permissions
- `Unauthorized caller` (operation types): Admin lacks catalog permissions

**End-User Impact:** All result in "permission denied for this action"
**User Action:** All require obtaining proper authorization or role assignment
**Business Outcome:** Request rejected, no state changes

**Consolidation Rationale:** All authorization failures have same resolution path - get proper permissions.

**Proposed Consolidated Error:** `AuthorizationRequired`
- Context: required_permission, current_role, merchant_context
- Message: "Authorization required for this operation. Please check your permissions."

## Non-Redundant Errors (Keep Distinct)

### Insufficient Balance
**Unique Characteristic:** Has specific business resolution (purchase more credits)
**User Impact:** Clear actionable message about adding credits
**Keep Distinct:** Users need to know current balance and purchase options

### Operation Expired/Timeout
**Unique Characteristic:** Time-based failure with retry implications  
**User Impact:** Clear guidance about starting new operation
**Keep Distinct:** Different from other operation failures, specific retry pattern

### Database/System Errors
**Technical Errors:**
- `Database transaction failure`
- `Connection timeout`
- `Concurrent rate changes`

**Unique Characteristic:** Infrastructure issues requiring system-level resolution
**User Impact:** "Service temporarily unavailable, try again later"  
**Keep Distinct:** Different handling pattern from business logic errors

**Proposed Consolidated Error:** `ServiceUnavailable`
- Context: error_type (database|network|concurrency), retry_after
- Message: "Service temporarily unavailable. Please try again in a few moments."

## Consolidation Summary

### Before: 25+ Scattered Error Types
- ProductNotFound, ProductNotAvailable, PricingMismatch
- User has active operation, Operation type not found, Operation type inactive  
- Multiple duplicate/already processed errors
- Multiple authorization errors
- Multiple invalid input errors
- Plus various system-level errors

### After: 6 Consolidated Business Error Types
1. **`ProductUnavailable`** - Product cannot be purchased right now
2. **`OperationUnavailable`** - Operation cannot be started right now  
3. **`InsufficientBalance`** - User needs to add credits (unique business case)
4. **`DuplicateAdminAction`** - Administrative action already completed (Priority 2 only)
5. **`InvalidRequest`** - Request format/data is invalid (integration issue)
6. **`AuthorizationRequired`** - Permission denied (admin/security issue)
7. **`ServiceUnavailable`** - Infrastructure/system issue (retry later)

## Key Insight: Idempotency Behavior Split

**Success Responses (Not Errors):**
- `Purchase.Settled` duplicates → Return { lot, receipt }
- `Operation.Open` duplicates → Return { operation_id }  
- `Grant.Apply` (welcome) duplicates → Return { lot }

**Error Responses:**
- Administrative operation duplicates → `DuplicateAdminAction` error

This aligns with the domain requirements for Priority-Based Idempotency Strategy where production-critical operations materialize results while administrative operations reject duplicates.

### Consolidation Benefits
- **User Experience**: Clear, consistent error messages with actionable guidance
- **Integration Simplicity**: Fewer error types to handle in upstream applications  
- **Maintenance**: Less error handling code to maintain and test
- **Business Alignment**: Errors match actual business outcomes, not technical implementation details

## Error Context Requirements

Each consolidated error type needs sufficient context for:
1. **User messaging**: Clear explanation of what happened
2. **Resolution guidance**: What the user/admin should do next
3. **Retry behavior**: When and how to retry the operation
4. **Audit trail**: Enough detail for troubleshooting and compliance

## Technical Implementation Notes

### Effect Tagged Error Structure (Corrected)
```typescript
// Business errors only (no successful idempotency cases)
type DomainError = 
  | ProductUnavailable
  | OperationUnavailable  
  | InsufficientBalance
  | DuplicateAdminAction  // Only Priority 2 admin duplicates
  | InvalidRequest
  | AuthorizationRequired
  | ServiceUnavailable
```

### Idempotency Implementation
```typescript
// Priority 1: Return stored results (not errors)
if (existing?.status === 'SUCCEEDED') return existing.result; // Success response

// Priority 2: Return error for admin duplicates  
if (existing?.status === 'ADMIN_DUPLICATE') throw new DuplicateAdminAction(...); // Error response
```

### Mapping Strategy
- Individual technical errors map to consolidated business errors at service layer
- Context preserved for debugging while simplifying client-side error handling
- Priority 1 idempotency returns successful stored results (not errors)
- Priority 2 admin duplicates return `DuplicateAdminAction` errors
- Retry guidance consistent across `ServiceUnavailable` scenarios

This correction fundamentally changes our error handling approach to align with the domain's sophisticated idempotency requirements.