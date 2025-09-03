# Operation Type Catalog

## Purpose
Define merchant-configurable operation types with resource-to-credit conversion rates. Operation types represent atomic business operations that consume measurable resources and convert them to credit debits.

**Workflow Context**: Workflows are user-facing units of work managed by upstream applications. The credit system only requires a `workflow_id` for each ledger entry to support external aggregation - workflow lifecycle and business logic remain outside credit system scope.

---

## Operation Types Overview

Operation types are external identifiers used for audit trail and resource-to-credit conversion. The **ledger reason** (purchase, debit, grant, etc.) is determined by the **command** that creates the ledger entry, not by the operation type.

**Example Operation Types (from sample data):**
- **transcriber**: Audio transcription service
- **extractor**: Content extraction service  
- **topic_generator**: Topic generation service
- **ameriabank**: Ameriabank payment provider
- **paypal**: PayPal payment provider
- **stripe**: Stripe payment provider
- **manual_payment**: Manual payment processing
- **welcome_grant**: Signup welcome credits
- **promo_grant**: Promotional credit issuance
- **manual_adjustment**: Administrative credit adjustments
- **compensation**: Service issue compensation credits
- **refund**: Credit refund processing
- **chargeback**: Payment chargeback handling
- **lot_expiry**: Credit lot expiration processing

---

## Operation Type Specification

### Merchant-Scoped Configuration
Each merchant maintains their own operation type catalog with:

**Core Properties:**
- **operation_code**: Unique identifier within merchant (e.g., "transcriber_v1")
- **display_name**: User-friendly name (e.g., "Audio Transcription")  
- **resource_unit**: Source measurement unit (e.g., "K_TOKENS", "EUR", "CREDIT")
- **credits_per_unit**: Conversion rate from resource to credits
- **workflow_type**: Optional workflow type association for operational reporting

**Lifecycle Properties:**
- **effective_at**: When this operation type becomes active (must be now or future, never past)
- **archived_at**: When this operation type is retired
- **is_active**: Current active status

### Immutability Rules
- **Single Active Version**: Only one version of each operation_code active at any time
- **Atomic Sequential Lifecycle**: New version effective_at = previous version archived_at (no gaps or overlaps)
- **Immediate Transitions**: Rate changes are instantaneous using atomic `OperationType.CreateWithArchival` command
- **Rate Stability**: Operations use rate from operation type active at execution time
- **Historical Preservation**: All versions maintained for audit trail

---

## Sample Operation Type Catalog

**Command-to-Reason Mapping:**
- `Purchase.Settled` command → `reason = purchase` (regardless of operation_type: ameriabank, paypal, stripe, etc.)
- `Debit.RecordFromUsage` command → `reason = debit` (regardless of operation_type: transcriber, extractor, etc.)
- `Grant.Apply` command → `reason = welcome|promo|adjustment` (regardless of operation_type)
- `Refund.Apply` command → `reason = refund` (regardless of operation_type)
- `Chargeback.Apply` command → `reason = chargeback` (regardless of operation_type)
- `Lot.Expire` system process → `reason = expiry` (operation_type: lot_expiry)

### Sample Operation Types
Based on sample transaction data:

**transcriber_v1**
- display_name: "Audio Transcription Service"
- resource_unit: "K_TOKENS"  
- credits_per_unit: 0.57
- workflow_type: "interview_analysis"
- effective_at: 2025-08-01

**extractor_v1**  
- display_name: "Content Extraction Service"
- resource_unit: "K_TOKENS"
- credits_per_unit: 0.52
- workflow_type: "interview_analysis"
- effective_at: 2025-08-01

**topic_generator_v1**
- display_name: "Topic Generation Service"  
- resource_unit: "K_TOKENS"
- credits_per_unit: 1.11
- workflow_type: "interview_analysis" 
- effective_at: 2025-08-01

**ameriabank_v1**
- display_name: "Ameriabank Payment"
- resource_unit: "EUR"
- credits_per_unit: 6.67
- effective_at: 2025-08-01

**welcome_grant_v1**
- display_name: "Welcome Credits"
- resource_unit: "CREDIT"  
- credits_per_unit: 1.0
- effective_at: 2025-08-01

---

## Rate Management

### Rate Change Process
Rate changes use atomic transitions to ensure no gaps or overlaps between operation type versions:

**Atomic Transition**: Use `OperationType.CreateWithArchival` command (see [04_domain_command_catalog.md](04_domain_command_catalog.md)) which:
- Finds current active version by `(merchant_id, operation_code)`
- Sets its `archived_at = effective_at` of new version
- Creates new operation type version with updated rate
- Handles first-version case (no existing type to archive)
- New rates apply to operations at exact effective_at timestamp

---

## Business Rules

### Operation Execution
- **Active Rate Lookup**: Use operation type active at execution timestamp
- **Ceiling Rounding**: Resource→credit conversion rounds up to whole credits
- **Minimum Charge**: Each operation charges minimum 1 credit
- **Resource Precision**: Store resource amounts with high precision for audit

### Merchant Independence  
- **Isolated Catalogs**: Each merchant maintains separate operation type catalog

---

## Cross-Spec Invariants

### With Workflow & Operations  
- All ledger entries include required workflow_id for external aggregation (per ledger spec)
- Operation types may reference workflow_type for operational reporting and categorization
- Single active version rule prevents rate conflicts during operations
- Historical preservation supports audit trail and rate analysis

### With Ledger & Balance  
- All ledger debits reference operation types for rate audit trail
- Resource amounts preserved alongside credit debits for cost analysis
- Operation type immutability ensures consistent historical reporting

### With Product Pricing
- Operation rates independent of product lot pricing
- Both follow same immutability pattern with different concurrency rules
- Merchant-level configuration maintains data isolation
