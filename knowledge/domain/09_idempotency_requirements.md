# Idempotency Requirements

## Purpose
Define idempotency guarantees and patterns for all credit ledger domain commands, ensuring reliable operation under concurrent access, network retries, and system failures while maintaining lean complexity appropriate to each command's usage context.

---

## Two-Tier Idempotency Model

The credit ledger uses a **two-tier approach** recognizing different usage patterns:

- **Tier 1 (Upstream Application Commands)**: Business-critical operations with concurrent usage requiring robust idempotency mechanisms
- **Tier 2 (Control App Commands)**: Administrative operations with rare, supervised usage relying on database-level guarantees

---

## Tier 1: Upstream Application Commands

### Scope
Commands initiated by upstream applications during normal business operations:
- `Purchase.Settled`
- `Operation.Open` 
- `Operation.RecordAndClose`
- `Grant.Apply` (welcome grants only)

### Idempotency Patterns

#### Pattern A: Natural Business Keys
**Commands**: `Purchase.Settled`
- **Key**: `external_ref` (payment provider transaction identifier)
- **Scope**: Per merchant (merchant_id isolation)
- **Guarantee**: Same external_ref produces no additional credit lots or receipts

#### Pattern B: Explicit Idempotency Keys  
**Commands**: `Operation.Open`, `Operation.RecordAndClose`
- **Key**: `idempotency_key` (client-generated, e.g., UUID v4)
- **Scope**: Per merchant (merchant_id isolation)
- **Guarantee**: Same idempotency_key returns identical operation results

#### Pattern C: Natural Uniqueness Constraints
**Commands**: `Grant.Apply` (welcome)
- **Key**: Implicit `(merchant_id, user_id)` uniqueness
- **Guarantee**: One welcome grant per user within merchant context

### Tier 1 Guarantees

1. **Duplicate Detection**: Commands recognize and handle duplicate requests within 24-hour retention window
2. **Identical Results**: Duplicate requests return identical responses without additional side effects
3. **Concurrent Safety**: Simultaneous requests with same idempotency key handled without race conditions
4. **Merchant Isolation**: Idempotency keys scoped per merchant - no cross-merchant interference

### Error Responses

**Successful Duplicate**: Return original result with identical response structure
**In-Progress Duplicate**: Return operation status with time remaining (for Operation.Open)
**Invalid Key**: Return validation error for malformed idempotency keys

---

## Tier 2: Control App Commands

### Scope
Administrative commands with rare, supervised usage:
- `Grant.Apply` (promo/admin grants)
- `CreditAdjustment.Apply` / `DebitAdjustment.Apply`
- `Product.Create` / `Product.Archive`
- `OperationType.CreateWithArchival`
- `Refund.Apply` / `Chargeback.Apply`
- System jobs: `Operation.Cleanup` / `Lot.Expire`

### Simplified Approach

**Mechanism**: PostgreSQL transaction isolation + unique constraints
**Pattern**: Natural business key uniqueness (`product_code`, `external_ref`, etc.)
**Behavior**: Database constraint violations return descriptive errors

### Examples

- `Product.Create`: Unique `product_code` constraint prevents duplicates
- `Refund.Apply`: Unique `external_ref` constraint prevents double refunds  
- `OperationType.CreateWithArchival`: Unique `(merchant_id, operation_code, effective_at)` prevents duplicate rates

### Tier 2 Guarantees

1. **Database-Level Protection**: PostgreSQL prevents duplicate records through constraints
2. **Descriptive Errors**: Constraint violations return existing record details for admin review
3. **Simple Retry**: Admin operators can safely retry failed operations
4. **No Explicit Keys**: No `idempotency_key` parameters required

---

## Cross-Tier Consistency

### Shared Principles
- All commands respect merchant isolation boundaries
- Ledger entries remain immutable - corrections via compensating entries only
- Complete audit trail maintained regardless of idempotency mechanism

### Integration Points
- Tier 1 commands may trigger Tier 2 effects (e.g., Purchase.Settled → receipt generation)
- Tier 2 commands cannot affect Tier 1 operation results retroactively
- System jobs (Tier 2) clean up Tier 1 operation state consistently

---

## Failure Scenarios

### Partial Failure Recovery
**Problem**: Command passes idempotency check but fails during execution
**Solution**: 
- Tier 1: Retry returns partial completion status; system completes operation
- Tier 2: Database rollback; admin retries manually

### Concurrent Duplicate Requests  
**Problem**: Same idempotency key arrives simultaneously
**Solution**:
- Tier 1: First request proceeds; subsequent requests wait and return first result
- Tier 2: Database serialization handles conflicts; later request gets constraint error

### System Recovery
**Problem**: Service restarts with incomplete operations
**Solution**:
- Tier 1: Operations have explicit cleanup jobs and timeout handling
- Tier 2: PostgreSQL transaction boundaries ensure consistent state

---

## Implementation Notes

### Key Format Standards
- **Natural Keys**: Use as-provided by external systems (payment refs, product codes)
- **Explicit Keys**: Recommend UUID v4 format, client-generated
- **Character Limits**: Max 255 characters for idempotency keys

### Retention Policy
- **Tier 1**: 24-hour duplicate detection window
- **Tier 2**: Permanent constraint enforcement (no cleanup required)

### Monitoring
- Track duplicate detection rates for Tier 1 commands
- Monitor constraint violation patterns for Tier 2 commands
- Alert on excessive retry attempts

---

## Out of Scope

- Cross-service idempotency coordination
- Idempotency key generation standards (client responsibility)
- Performance optimization for high-frequency duplicate detection