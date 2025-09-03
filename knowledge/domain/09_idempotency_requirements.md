# Idempotency Requirements

## Purpose
Define idempotency guarantees for all credit ledger domain commands to ensure customer trust, operational reliability, and regulatory compliance. These requirements establish business promises about duplicate protection while managing project scope through prioritized robustness levels.

---

## Business Scope Framework

The credit ledger applies **scope-prioritized idempotency** based on business impact and operational context:

**Priority 1 (Production-Critical Operations)**
- **Business Impact**: Customer-facing operations directly affecting revenue, user experience, and trust
- **Scope**: Comprehensive duplicate protection with strong consistency guarantees
- **Rationale**: Customer trust and revenue protection justify robust engineering investment

**Priority 2 (Administrative Operations)**
- **Business Impact**: Infrequent, supervised tasks performed by trained operators with human oversight
- **Scope**: Simple, reliable duplicate detection that minimizes implementation complexity
- **Rationale**: Project scope control - administrative tasks can tolerate simpler error handling

---

## Priority 1: Production-Critical Operations

### Business Operations in Scope
Customer-facing operations that directly impact revenue and user experience:
- `Purchase.Settled` - Payment settlement and credit issuance
- `Operation.Open` - Workflow operation reservation
- `Operation.RecordAndClose` - Credit consumption debiting
- `Grant.Apply` (welcome grants) - New user credit allocation

### Business Identity Guarantees

#### Purchase Settlement
**Business Identity**: External settlement reference from payment provider
**Guarantee**: Same external settlement reference for the same merchant MUST yield exactly one credit lot and one receipt
**Business Context**: Prevents customer double-charging and ensures single receipt per payment

#### Operation Execution  
**Business Identity**: Logical operation instance within merchant and user context
**Guarantee**: The same logical operation instance MUST produce at most one debit entry and one terminal outcome
**Business Context**: Ensures consistent credit consumption regardless of network retries or system failures

#### Welcome Grants
**Business Identity**: User identity within merchant context
**Guarantee**: At most one welcome grant per user per merchant
**Business Context**: Prevents signup bonus farming while ensuring every legitimate user receives their welcome credits

### Production-Critical Guarantees

1. **Operational Duplicate Detection**: All idempotency tracking operates within a 7-day window, providing sufficient coverage for payment provider webhook retries and legitimate operational retry scenarios

2. **Customer Protection**: Users will never be double-charged; repeated settlement requests will surface the same credit lot and receipt

3. **Operation Integrity**: If multiple requests represent the same logical operation, one will complete successfully; others will return the same final outcome once available

4. **Merchant Data Isolation**: All duplicate detection operates within merchant boundaries - no cross-merchant interference or data leakage

---

## Priority 2: Administrative Operations

### Business Operations in Scope
Supervised administrative tasks performed by trained operators with human oversight:
- `Grant.Apply` (promotional and administrative grants)
- `CreditAdjustment.Apply` / `DebitAdjustment.Apply` - Account corrections
- `Product.Create` / `Product.Archive` - Catalog management
- `OperationType.CreateWithArchival` - Rate management
- `Refund.Apply` / `Chargeback.Apply` - Payment disputes
- System jobs: `Operation.Cleanup` / `Lot.Expire` - Automated maintenance

### Administrative Guarantees

#### Business Identity Recognition
**Approach**: Natural business entity uniqueness (product codes, settlement references, rate effective dates)
**Guarantee**: Duplicate administrative actions targeting the same business entity will be detected and rejected
**Business Context**: Prevents accidental duplicate grants, overlapping product definitions, or conflicting rate schedules

#### Operator Safety
**Guarantee**: Administrative errors can be easily detected and safely retried by operators
**Business Context**: Human operators can confidently retry failed operations without concern for duplicate side effects

#### Audit Trail Preservation
**Guarantee**: All administrative duplicate attempts are logged with existing record details for operator review
**Business Context**: Maintains complete audit trail for regulatory compliance and operational troubleshooting

### Simplified Approach Rationale

Administrative operations benefit from **simple, reliable duplicate detection** rather than complex consistency mechanisms because:

1. **Human Oversight**: Trained operators can identify and resolve conflicts when they occur
2. **Low Frequency**: Rare execution reduces complexity and contention risks  
3. **Project Scope Control**: Simple approach minimizes engineering investment for non-revenue-critical operations
4. **Operational Transparency**: Clear error messages enable operators to understand and resolve issues quickly

---

## Cross-Priority Consistency

### Universal Business Principles
- All commands respect merchant data isolation boundaries - no cross-merchant interference
- Ledger entries remain immutable - corrections via compensating entries only  
- Complete audit trail maintained for regulatory compliance and operational transparency

### Integration Points
- Production-critical commands may trigger administrative effects (e.g., Purchase.Settled → receipt generation)
- Administrative commands cannot retroactively affect production operation results
- System maintenance jobs clean up production operation state consistently

---

## Concurrency and In-Flight Operations

### Business Promises for Concurrent Operations

#### Customer-Facing Guarantees
**Promise**: If two requests represent the same logical business operation, one will complete successfully; others will return the same final outcome once available
**Business Context**: Customers experience consistent results regardless of network conditions, browser refreshes, or system load

#### In-Progress Operation Handling  
**Behavior**: While an operation is in progress, the system MAY return an in-progress response with suggested retry guidance
**Business Context**: Users receive helpful feedback during processing rather than confusing timeout errors

#### Settlement Consistency
**Promise**: Payment settlements and dispute-related operations maintain consistency within the 7-day operational window
**Business Context**: Covers payment provider retry scenarios while maintaining lean system complexity

### Operational Intent Integrity

#### Same Intent Rule
**Policy**: Reusing an operation identity with materially different business parameters (different amount, currency, user, or merchant context) MUST be rejected as an Intent Conflict
**Business Context**: Prevents accidental cross-wiring of business operations while maintaining duplicate protection
**Examples**:
- Same settlement reference used for different payment amounts
- Same operation identity used across different user accounts
- Same administrative action attempted with conflicting parameters

#### Conflict Resolution
**Behavior**: Intent Conflicts MUST NOT change ledger state and MUST provide clear diagnostic information for resolution
**Business Context**: Operations staff can quickly identify and resolve parameter mismatches without data corruption risk

---

## Monitoring and Operational Visibility

### Business Health Indicators
- **Duplicate Detection Rates**: Monitor frequency of duplicate operations to identify integration issues or customer experience problems
- **Intent Conflict Patterns**: Track parameter mismatch attempts to identify operational training needs or system integration issues  
- **Settlement Consistency**: Monitor payment settlement duplicate rates during high-volume periods or payment provider issues
- **Administrative Error Rates**: Track operator duplicate attempts to identify process improvement opportunities

### Regulatory and Compliance Support
- **Audit Trail Completeness**: All idempotency decisions logged with business context for regulatory review
- **Dispute Resolution Support**: Settlement and chargeback duplicate detection maintains integrity through legal dispute timelines
- **Merchant Isolation Verification**: Regular validation that duplicate detection respects merchant data boundaries

---

## Business Scope Boundaries

### In Scope
- **Customer Trust Protection**: Preventing double-charges, duplicate credits, inconsistent account states
- **Operational Reliability**: Ensuring administrative staff can safely retry operations
- **Regulatory Compliance**: Maintaining audit trails and accounting integrity for business and legal requirements
- **Project Scope Management**: Balancing robustness with engineering complexity based on business risk

### Out of Scope
- **Cross-Service Coordination**: Idempotency guarantees limited to credit ledger domain boundaries
- **Client-Side Standards**: Upstream applications responsible for operation identity generation strategies  
- **Performance Optimization**: Basic reliability prioritized over high-frequency operation optimization
- **Complex Workflow Coordination**: Multi-step business process idempotency handled by upstream applications