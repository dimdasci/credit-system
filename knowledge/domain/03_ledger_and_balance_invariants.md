# Ledger & Balance Invariants

## Purpose
State the non‑negotiable accounting truths for issuance, consumption, expiry, balance, and idempotency across all ledger events: purchases, operations, grants, refunds, chargebacks, adjustments, and system processes.

---

## Core Entities

**Product vs Lot vs Credit Entry:**
- **Product**: Immutable catalog template (`product_code`, `credits`, `access_period_days`, `distribution`) stored in product catalog
- **Lot**: A credit ledger entry that represents an issued credit lot (`reason = purchase|welcome|promo|adjustment`). The lot IS the credit entry.
- **lot_id**: The unique identifier of the credit ledger entry. All subsequent debits reference this lot_id.
- **Lot Balance**: Sum of all ledger entries (credits + debits) with the same lot_id
- **Lot Expiry**: Calculated as credit entry timestamp + product's access_period_days

**Flow**: Product (template) → Issue credit lot → Creates credit ledger entry → This entry IS the "lot" → Future debits reference its lot_id

## Reasons (enum)
`purchase | debit | expiry | welcome | promo | refund | chargeback | adjustment`

## Ledger Entry Context
Every ledger entry includes:
- **merchant_id**: Merchant context for complete isolation
- **user_id**: Account holder reference  
- **amount**: Credit value (+credit, -debit)
- **reason**: Entry type from enum above
- **lot_id**: Reference to associated lot (required for all entries)
- **operation_type**: Business operation identifier (required for all entries)
- **resource_amount**: Original source measurement (required for all entries)
- **resource_unit**: Source measurement unit (required for all entries)  
- **workflow_id**: Workflow context for operation aggregation (required for all entries)
- **note**: Optional free-form text for administrative context (justifications, admin actions)

---

## Issuance Rules

Initiator of the event is upstream or control panel only. 

- **Purchase Settlement:** Issue credit lot from purchased sellable product, creating credit ledger entry (`reason = purchase`) with payment operation context (operation_type: payment_method, resource_amount: payment_amount, resource_unit: payment_currency). Generate receipt.
- **Grant Issuance:** Issue credit lot from grant product, creating credit ledger entry (`reason = welcome|promo`) with grant operation context (operation_type: grant_type, resource_amount: credit_amount, resource_unit: "CREDIT"). No receipt.
- **Credit Adjustments:** Issue credit lot from ephemeral adjustment product, creating credit ledger entry (`reason = adjustment`) with adjustment operation context (operation_type: "manual_adjustment", resource_amount: credit_amount, resource_unit: "CREDIT").

**Invariant L1:** Every issuance event issues exactly one credit lot, creating one credit ledger entry with complete operation context. This credit entry IS the "lot".

**Invariant L2:** Only purchase lots generate receipts; all other lot types (grants, adjustments) never generate receipts.

---

## Consumption Rules
All credit consumption creates ledger debit entries that reduce balance:

- **Operations**: Two-phase operation protocol ensures controlled consumption:
  1. `Operation.Open` validates balance >= 0, captures operation type rate, and creates operation reservation
  2. `Operation.RecordAndClose` uses captured rate from Open time for rate stability and creates debit entry
- **Operation Concurrency**: Single open operation per (merchant_id, user_id) prevents excessive overdraft
- **Refunds**: Control app creates debit entry with `refund` reason, targeting specific lot_id
- **Chargebacks**: Control app creates debit entry with `chargeback` reason, targeting specific lot_id  
- **FIFO consumption**: Operations consume oldest non‑expired lots first. When operation amount exceeds remaining credits in oldest lot, entire debit applies to that lot (allowing individual lots to go negative), preserving FIFO order for subsequent operations
- **Immediate debiting**: Credits debited when operation completes via `Operation.RecordAndClose`, not when workflow ends

**Invariant C1:** Every debit entry includes operation_type, resource_amount, resource_unit, and workflow_id for complete audit trail.

**Invariant C2:** Balance may go negative after any debit (overdraft allowed). Debt resolution occurs through future credit issuance.

**Invariant C3:** Operation Lifecycle - Single open operation per user prevents concurrent race conditions while maintaining overdraft semantics.

**Invariant C4:** Rate Stability - Operations use the conversion rate captured during Operation.Open, ensuring predictable billing regardless of subsequent operation type changes.

---

## Expiry Rules
- Lots expire when current time > lot creation time + access_period_days. Expiry jobs run periodically (e.g., daily) and process all lots past their expiry time.
- Record one `expiry` debit equal to remaining positive credits in the lot with complete ledger context (lot_id, operation_type: "lot_expiry", resource_amount: max(0, remaining_credits), resource_unit: "CREDIT", workflow_id: generated).
- Lots with negative balance at expiry require no expiry debit (debt carries forward to future purchases).
- If a debit and expiry coincide, work completed before expiry processes normally; subsequent operations cannot consume expired lots.

**Invariant E1:** Expiry is time-based only. Lots expire regardless of remaining balance (positive, zero, or negative).

---

## Balance Semantics
- `balance = Σ(all ledger amounts)` - reflects net result across all lots.
- Individual lots can have negative balances; total user balance is sum of all ledger entries across all lots.
- Negative total balance is allowed (overdraft model). New operation authorization requires balance >= 0 at `Operation.Open`.
- Data access/export remains available regardless of balance.

**Invariant B1:** Balance calculation is always the sum of all ledger entries. New operation authorization checked at operation start, not during execution.

---

## Integrity & Idempotency
- Every command/event must carry an **idempotency key**.
- Ledger is immutable; corrections are compensating entries only.
- All ledger entries must include complete operation context (lot_id, operation_type, resource_amount, resource_unit, workflow_id) regardless of reason.
- **Duplicate Detection Window**: Idempotency tracking operates within a 7-day operational window, distinct from permanent ledger retention.

**Invariant I1:** Replaying any accepted event (purchase, grant, adjustment, refund, chargeback, operation) yields **no additional** ledger entries within the 7-day idempotency window.

---

## Cross‑Spec Invariants
- With **Product & Pricing**: grant products have single grant policy (`apply_on_signup` OR `manual_grant`) and no prices; sellable products drive receipts and pricing snapshots; ephemeral adjustment products created on-the-fly for credit adjustments.
- With **Workflow & Operations**: all ledger entries include workflow_id, lot_id, operation_type, resource_amount, and resource_unit for complete audit trail; operation_type links to merchant operation type catalog for rate audit; two-phase operation protocol ensures controlled resource consumption.
- With **Operation Lifecycle**: `Operation.Open` validates balance and reserves operation slot; `Operation.RecordAndClose` creates ledger entry and closes operation; single open operation per user prevents race conditions.
- With **Queries**: `ListAvailableProducts` excludes grant products; `GetBalance` equals the sum of `GetLedgerHistory` at the same evaluation point; operation lifecycle queries support monitoring and cleanup.
- With **FIFO & Balance**: individual lots can have negative balances from FIFO consumption; total user balance reflects net result across all lots; lots lists reflect FIFO consumption order and expiry status.
- With **Presentation**: workflow aggregation handled by presentation layer using workflow_id from ledger entries.

