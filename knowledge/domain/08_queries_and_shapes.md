# Queries & Shapes (Read Model Spec)

## Conventions
- **Times** are ISO‑8601 with timezone.
- **Money** = `{ amount, currency }` (tax‑inclusive).
- **IDs** are opaque strings.
- **Pagination** uses cursor‑based: `{ cursor?, limit }` → `{ items, next_cursor? }`.
- **Auth:** unless stated otherwise, the **caller must be the resource owner** (same `user_id`) or an **admin/support** actor.

---

## 1) Catalog & Pricing

### 1.1 `ListAvailableProducts`
**Purpose:** Return all active sellable products with resolved prices for a given country within merchant context.
**Inputs:**
- `merchant_id` (implicit merchant context)
- `country` (ISO‑3166‑1 alpha‑2)
**Output (per product):**
- `product_code`
- `title`
- `credits`
- `access_period_days`
- `price`: `{ amount, currency }`
- `tax?`: `{ type, rate?, amount?, note? }` (derived from merchant tax regime)
- `availability`: `available|not_for_sale`
- `marketing?` (optional short copy)
**Invariants:**
- Exactly one price row is resolved per product: country‑specific if exists, else fallback (`country: "*"`).
- Archived products never appear.
- Grant products excluded from listing.

---

## 2) Balance & Lots

### 2.1 `GetBalance`
**Purpose:** Show the user's effective credit balance within merchant context.
**Inputs:** 
- `merchant_id` (implicit merchant context)
- `user_id` (caller must be the user or admin)
**Output:**
- `user_id`
- `balance_credits` (integer; may be negative)
- `account_lock?`: `{ locked: boolean, reason?: string, until?: time }`

### 2.2 `ListActiveLots`
**Purpose:** Show user's unexpired, non‑empty lots within merchant context.
**Inputs:**
- `merchant_id` (implicit merchant context)
- `user_id` (caller must be the user or admin)
**Output (per lot):**
- `lot_id`
- `lot_created_month` (UTC month date; internal key for joins)
- `product_code`
- `issued_at`
- `expires_at`
- `credits_total`
- `credits_remaining`
- `source`: `purchase|welcome|promo|adjustment`
- `purchase_ref?`: `{ external_ref, country, currency, amount }` (when source=purchase)

---

## 3) Ledger & Usage History

### 3.1 `GetLedgerHistory` (paginated)
**Purpose:** Append‑only history of credit movements.
**Inputs:** `{ cursor?, limit, reason_filter?, time_from?, time_to?, created_months? }`
Notes:
- `created_months` is an optional array of UTC month dates to enable partition pruning. If absent, the server derives months from `time_from/time_to`.
**Output (per entry):**
- `entry_id`
- `created_at`
- `created_month` (UTC month date; internal key for joins)
- `amount_credits`
- `reason`
- `lot_id?`
- `lot_month?` (UTC month date when present)
- `source_units?`
- `meta?`

### 3.2 `GetUsageSummary`
**Purpose:** Quick aggregates for UI.
**Inputs:** `{ time_from, time_to }`
**Output:**
- `period`: `{ from, to }`
- `credits_debited`
- `workflow_count`
- `by_source_unit?`: array of `{ unit, amount, credits_debited }`

---

## 4) Receipts & Documents

### 4.1 `ListReceipts` (paginated)
**Purpose:** Show user’s receipts for settled purchases.
**Output (per receipt):**
- `receipt_id`
- `issued_at`
- `purchase`: `{ product_code, country, currency, amount }`
- `external_ref`
- `download_url`
Internal joins use `(lot_id, lot_created_month)`.

### 4.2 `GetReceipt`
**Purpose:** Retrieve a specific receipt.
**Inputs:** `receipt_id`
**Output:** document handle/URL plus metadata.

---

## 5) Admin / Support Reads

### 5.1 `SearchUsersByPurchaseRef`
**Purpose:** Locate a user by external payment reference.
**Inputs:** `external_ref`
**Output:** `{ user_id, latest_purchase_at, match_confidence }`

### 5.2 `GetAccountOverview`
**Purpose:** Support dashboard view.
**Inputs:** `user_id`
**Output:**
- `user_id`
- `balance_credits`
- `account_lock?`
- `active_lots` (summary)
- `recent_activity` (last N ledger entries)

---

## 6) Operation Type Management

### 6.1 `ListOperationTypes`
**Purpose:** Show merchant's operation type catalog for admin management.
**Inputs:** `merchant_id`, `include_archived?` (default: false)
**Output (per operation type):**
- `operation_code`
- `display_name`  
- `resource_unit`
- `credits_per_unit`
- `workflow_type_code?`
- `effective_at`
- `archived_at?`
- `is_active` (computed: effective_at <= now < archived_at)

### 6.2 `GetOperationType`
**Purpose:** Get specific operation type details for admin review.
**Inputs:** `merchant_id`, `operation_code`
**Output:** Complete operation type details including all historical versions.

### 6.3 `GetActiveOperationTypes`  
**Purpose:** Get currently active operation types for rate lookup during operations.
**Inputs:** `merchant_id`, `at_timestamp?` (default: now)
**Output:** Only operation types active at specified timestamp.
**Usage:** Internal service calls for rate lookup during `Operation.RecordAndClose`.

---

## 7) Operation Lifecycle Management

### 7.1 `ListOpenOperations`
**Purpose:** Show active operations for monitoring and admin management.
**Inputs:** `merchant_id`, `user_id?` (optional filter), `include_expired?` (default: false)
**Output (per operation):**
- `operation_id`
- `user_id`
- `operation_type_code`
- `workflow_id?`
- `started_at`
- `expires_at` (started_at + operation_timeout_minutes)
- `time_remaining` (computed: expires_at - now, or 0 if expired)
Implementation notes:
- Operations table is not partitioned; a partial unique index enforces at most one open operation per user.
- Closed operations are retained for a short TTL (e.g., 60 days) for ops metrics and then cleaned up.

### 7.2 `GetOperationMetrics`
**Purpose:** Operation usage patterns and timeout analysis for merchant dashboard.
**Inputs:** `merchant_id`, `time_from`, `time_to`
**Output:**
- `period`: `{ from, to }`
- `operations_opened`
- `operations_completed`
- `operations_timed_out`
- `average_operation_duration`
- `by_user`: array of `{ user_id, operations_count, timeout_count }`
- `by_operation_type`: array of `{ operation_type, operations_count, avg_duration }`

---

## Cross‑Query Invariants
1. `GetBalance.balance_credits` = sum of all ledger entries in `GetLedgerHistory` within merchant context.
2. `ListActiveLots` + expired lots partition all lots within merchant context.
3. Every `purchase` ledger entry has a receipt in `ListReceipts` within merchant context.
4. All queries respect merchant isolation - no cross-merchant data leakage.

---

## Out‑of‑Scope
- Currency conversion.
- Promo logic beyond catalog.
- Public unauthenticated access.
