# Domain Command Catalog (Provider‑Agnostic)

## A. Upstream Application → Ledger (User Events)

### 1) `Purchase.Settled`
**Purpose:** Record a successful payment and issue credit lot for a listed product at a resolved country price.

**Inputs:**
- `merchant_id` (merchant context for data isolation)
- `user_id` (external auth/user id from upstream application)
- `product_code` (active within merchant catalog)
- `pricing_snapshot` — taken from `ListAvailableProducts(country)` at checkout time:
  - `country` (ISO‑3166‑1 alpha‑2 or "*" for fallback)
  - `price`: `{ amount, currency }`
  - `tax?`: `{ type, rate?, amount?, note? }` (derived from merchant config)
- `order_placed_at` (checkout/order creation timestamp used for price validation)
- `external_ref` (provider transaction id)
- `settled_at`
- `idempotency_key`

**Preconditions:**
- `product_code` is **active at order_placed_at** within merchant catalog.
- `pricing_snapshot.country` is **available** for the product at `order_placed_at`.
- Amount/currency match the resolved price at `order_placed_at`.
- Merchant context valid for user.

**Effects:**
- Issue credit lot from purchased product, creating credit ledger entry (`reason = purchase`) with:
  - amount: +credits (from product template)
  - payment operation context: operation_type derived from payment method, resource_amount from pricing_snapshot, resource_unit from currency, workflow_id: generated for purchase
  - expiry: entry timestamp + product's access_period_days
- Create receipt record with complete transaction data and merchant config snapshot for PDF generation.
- Return receipt data to upstream application for PDF rendering and delivery.

**Idempotency:**
- Same external_ref produces no additional credit entries within 7-day operational window.

**Failure modes:**
- Product archived or not for sale in snapshot country.
- Snapshot incoherent (e.g., negative amount, unknown currency).

---

### 2) `Operation.Open`
**Purpose:** Reserve operation slot, validate balance, and return operation identifier for resource consumption.

**Inputs:**
- `merchant_id` (merchant context for data isolation)
- `user_id` (external auth/user id from upstream application)
- `operation_type_code` (active operation type within merchant catalog)
- `workflow_id?` (optional workflow context for external aggregation)
- `idempotency_key`

**Preconditions:**
- No existing open operation for (merchant_id, user_id)
- Current user balance >= 0 (prevent new operations when in debt)
- Operation type is currently **active** within merchant catalog
- User_id exists within merchant context

**Effects:**
- Capture current active operation type version and conversion rate for rate stability
- Create entry in open_operations table with operation_id and captured rate information
- Return operation_id for use in subsequent Operation.RecordAndClose

**Idempotency:** Same idempotency_key returns existing operation_id if still open, within 7-day operational window.

**Failure modes:**
- User has active operation: Return detailed error with operation_type, started_at, time_remaining
- Insufficient balance: "Current balance: [balance] credits. Please add credits before starting new operations."
- Operation type not found or inactive
- Invalid inputs

---

### 3) `Operation.RecordAndClose`
**Purpose:** Record atomic operation consumption with automatic resource-to-credit conversion and close the operation.

**Inputs:**
- `merchant_id` (merchant context for data isolation)
- `user_id` (external auth/user id from upstream application)
- `operation_id` (from Operation.Open, required)
- `workflow_id?` (optional workflow context, must match Operation.Open if both provided)
- `resource_amount` (consumed resource quantity with high precision)
- `resource_unit` (resource measurement unit, must match operation type)
- `completed_at` (operation completion timestamp)
- `idempotency_key`

**Preconditions:**
- Operation_id must exist and belong to user
- Resource unit matches operation type specification
- If workflow_id provided in both Open and RecordAndClose, they must match

**Effects:**
- Use operation type version and conversion rate captured during Operation.Open (rate stability)
- Calculate credit debit: ceiling(resource_amount × credits_per_unit), minimum 1 credit
- Find oldest non-expired lot for FIFO consumption
- Create single ledger entry (`reason = debit`) targeting that lot_id with complete operation context:
  - lot_id, operation_type_code, resource_amount, resource_unit, workflow_id
- Remove entry from open_operations table (close operation)
- Individual lot balance may go negative; total balance updated

**Idempotency:** One debit per unique operation (by idempotency_key) within 7-day operational window. If operation already closed, return success with existing ledger entry.

**Failure modes:**
- Operation_id not found or doesn't belong to user
- Resource unit mismatch with operation type
- Invalid resource amount (negative, zero, or exceeds reasonable limits)
- Workflow_id mismatch between Open and RecordAndClose
- Operation references archived operation type version (resolved by rate stability from Operation.Open)

---

### 4) `Grant.Apply` (Welcome)
**Purpose:** Issue one-time welcome grant lot on user signup.

**Inputs:** `merchant_id`, `user_id`, `idempotency_key`

**Preconditions:** 
- Welcome grant not yet issued for user_id within merchant context
- Merchant has configured welcome grant product

**Effects:** 
- Issue credit lot from configured welcome grant product, creating credit ledger entry (`reason = welcome`) with:
  - amount: +credits (from welcome grant product template)
  - grant operation context: operation_type: "welcome_grant", resource_amount: credits, resource_unit: "CREDIT", workflow_id: generated for grant
  - expiry: entry timestamp + product's access_period_days

**Idempotency:** Same idempotency_key produces no additional grants within 7-day operational window.

**Failure modes:** 
- Welcome grant already issued; 
- No configured welcome product.

---

## B. Control Panel (System/Admin) → Ledger (Grants & Adjustments)

### 5) `Grant.Apply` (Promo)
**Purpose:** Manually issue promotional grant lot.

**Inputs:** `merchant_id`, `user_id`, `credits`, `access_period_days`, `note?`, `admin_actor`, `idempotency_key`

**Preconditions:** Authorized admin caller within merchant context.

**Effects:** 
- Issue credit lot, creating credit ledger entry (`reason = promo`) with:
  - amount: +credits (from input parameter)
  - grant operation context: operation_type: "promo_grant", resource_amount: credits, resource_unit: "CREDIT", workflow_id: generated for grant, note: admin_actor context
  - expiry: entry timestamp + access_period_days from input

**Idempotency:** Same idempotency_key produces no additional grants within 7-day operational window.

**Failure modes:** 
- Unauthorized caller; 
- Invalid inputs.

---

### 6) `CreditAdjustment.Apply`
**Purpose:** Issue additional credit lot for service compensation, promotions, or corrections.

**Inputs:** `merchant_id`, `user_id`, `credit_amount`, `access_period_days`, `justification`, `admin_actor`, `idempotency_key`

**Preconditions:** 
- Authorized admin caller within merchant context
- Justification required for audit trail
- Credit_amount must be positive

**Effects:** 
- Create ephemeral adjustment product on-the-fly with:
  - product_code: generated (e.g., "credit_adj_<timestamp>")
  - title: derived from justification
  - credit_amount: from input
  - access_period_days: from input
  - distribution: "grant"
- Issue credit lot from ephemeral product, creating credit ledger entry (`reason = adjustment`) with:
  - amount: +credit_amount (from input parameter)
  - adjustment operation context: operation_type: "credit_adjustment", resource_amount: credit_amount, resource_unit: "CREDIT", workflow_id: generated for adjustment, note: justification
  - expiry: entry timestamp + access_period_days from input

**Idempotency:** Same idempotency_key produces no additional credit adjustments within 7-day operational window.

**Failure modes:** 
- Unauthorized caller; 
- Negative credits.

---

### 7) `DebitAdjustment.Apply`
**Purpose:** Deduct credits from existing lots for billing corrections or policy violations.

**Inputs:** `merchant_id`, `user_id`, `debit_amount`, `justification`, `admin_actor`, `idempotency_key`

**Preconditions:** 
- Authorized admin caller within merchant context
- Justification required for audit trail
- Debit amount must be negative

**Effects:** 
- Create debit ledger entry (`reason = adjustment`) with:
  - amount: debit_amount (negative value reduces balance)
  - adjustment operation context: operation_type: "debit_adjustment", resource_amount: abs(debit_amount), resource_unit: "CREDIT", workflow_id: generated for adjustment, note: justification
- Find oldest non-expired lot for FIFO consumption and target that lot_id
- Balance updated; may go negative (overdraft allowed)

**Idempotency:** Same idempotency_key produces no additional debit adjustments within 7-day operational window.

**Failure modes:** 
- Unauthorized caller; 
- Positive debit amount.

---

## C. Admin → Catalog (Lifecycle)

### 8) `Product.Create`
**Purpose:** Add catalog items (lot templates).

**Inputs:** 
 - `code`, `title`, `credit_amount`, `access_period_days` (create/update); `effective_at`, `archived_at`,
 - distribution: `sellable | grant`
 - grant_policy: `apply_on_signup` | `manual_grant` (optional)
 - `price_rows` (optional): Country‑specific or fallback pricing, inputs for every row: `currency`, `amount`, `vat_info?`

**Preconditions:** Unique `code` on create.

**Effects:** Product state updated; affects future purchases only.

**Idempotency:** By identifier.

**Failure modes:** 
- Duplicate codes; 
- Selling archived products.

---

### 9) `Product.Archive`
**Purpose:** Manage catalog items (lot templates).

**Inputs:** `code`, `archive_at` (must be now or in the future)

**Preconditions:** Unique `code` on create.

**Effects:** Product archive_at updated; affects future purchases only.

**Idempotency:** By identifier.

**Failure modes:** 
- Duplicate codes; 
- Selling archived products.

---

### 10) `Refund.Apply`
**Purpose:** Emergency full refund as compensating event for exceptional circumstances only (regulatory compliance, major service failures, payment disputes). Normal business flow does not support refunds.

**Inputs:** `merchant_id`, `user_id`, `external_ref`, `justification` (required), `admin_actor`

**Preconditions:** 
- Settled purchase linked by `external_ref` exists within merchant context
- Admin authorization required
- Justification must be provided
- Emergency refund policy allows

**Effects:** Ledger negative entry (`reason = refund`) equal to full original purchase amount with refund operation context (operation_type: "refund", resource_amount: original_amount, resource_unit: original_currency, workflow_id: generated for refund, note: justification).

**Idempotency:** Same external_ref produces no additional refunds within 7-day operational window.

**Failure modes:** 
- Missing linkage; 
- Insufficient authorization; 
- Purchase already refunded.

---

### 11) `Chargeback.Apply`
**Purpose:** Provider‑initiated full transaction reversal reflected in the ledger.

**Inputs:** `merchant_id`, `user_id`, `external_ref`, `category?`

**Preconditions:** Linked settled purchase exists within merchant context.

**Effects:** Ledger negative entry (`reason = chargeback`) equal to full original purchase amount with chargeback operation context (operation_type: "chargeback", resource_amount: original_amount, resource_unit: original_currency, workflow_id: generated for chargeback).

**Idempotency:** Same external_ref produces no additional chargebacks within 7-day operational window.

**Failure modes:** 
- Missing linkage; 
- Purchase already charged back.

---

## D. Admin → Operation Types (Rate Management)

### 12) `OperationType.CreateWithArchival`
**Purpose:** Define new operation type with automatic archival of previous version to enforce sequential lifecycle.

**Inputs:** 
- `merchant_id` (merchant context for data isolation)
- `operation_code` (operation identifier within merchant)
- `display_name` (user-friendly name)
- `resource_unit` (source measurement unit: K_TOKENS, EUR, CREDIT, etc.)
- `credits_per_unit` (conversion rate from resource to credits)
- `workflow_type_code?` (optional workflow type association)
- `effective_at` (when new operation type becomes active)
- `admin_actor`

**Preconditions:** 
- Authorized admin caller within merchant context
- `effective_at` must be future or now

**Effects:** 
- **Atomic transaction:** Archive current active version (if exists) with `archived_at = effective_at`
- Create new operation type version with specified `effective_at`
- Ensures sequential lifecycle with no gaps or overlaps
- Affects future operations only after effective_at
- Existing open operations continue using their captured rate from Operation.Open time

**Idempotency:** One operation type version per (merchant_id, operation_code, effective_at).

**Failure modes:** 
- Invalid conversion rate or inputs
- `effective_at` in the past
- Concurrent rate changes (handled by atomic transaction)

---

## E. System Jobs → Ledger (Automated Processes)

### 13) `Operation.Cleanup`
**Purpose:** Close stale operations that have exceeded the merchant-configured timeout period.

**Inputs:**
- `merchant_id` (merchant context for data isolation)
- `operation_id` (stale operation identifier)
- `cleanup_reason` (timeout, manual_cleanup, etc.)
- `system_actor`, `idempotency_key`

**Preconditions:**
- Operation exists and has exceeded timeout period (created_at + operation_timeout_minutes < current_time)
- Operation is still in open state

**Effects:**
- Remove entry from open_operations table
- Log cleanup event for audit trail
- Operation becomes unavailable for Operation.RecordAndClose

**Idempotency:** By operation_id + cleanup_reason combination within 7-day operational window.

**Failure modes:**
- Operation_id not found or already closed
- Operation not yet expired (within timeout window)

---

### 14) `Lot.Expire`
**Purpose:** Process expired lots by creating expiry debit entries for remaining positive credits.

**Inputs:** 
- `merchant_id` (merchant context for data isolation)
- `lot_id` (expired lot identifier)
- `expired_at` (expiry timestamp)
- `remaining_credits` (positive credits remaining in lot)
- `system_actor`, `idempotency_key`

**Preconditions:** 
- Lot exists and has passed its expiry time (creation_time + access_period_days < current_time)
- Lot has positive remaining credits (lots with negative balance require no expiry debit)

**Effects:** 
- Create ledger entry (`reason = expiry`) with expiry operation context:
  - operation_type: "lot_expiry", resource_amount: remaining_credits, resource_unit: "CREDIT", workflow_id: generated system workflow

**Idempotency:** By lot_id + expired_at combination within 7-day operational window.

**Failure modes:** 
- Lot already processed for expiry
- Lot has no positive credits remaining

---

## Common Guarantees (All Commands)
- **Atomic effect:** Each accepted command produces consistent state changes and necessary ledger entries.
- **Idempotency:** Callers supply an idempotency key; the ledger guarantees at‑least‑once safety without duplication.
- **Auditability:** Commands capture actor context (app/admin), timestamps, and notes for forensics.
