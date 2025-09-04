# Purchases & Payments Boundary (Domain Requirements)

## Purpose
Define how the **Credit Management Service** handles purchases and payments with a **provider‑agnostic** boundary. The ledger does not integrate with gateways; it accepts events from upstream applications that own checkout.

---

**Merchant Context:** All operations are scoped by `merchant_id`. Each merchant operates with complete data isolation via separate Supabase projects. Architecture: 1:1 application↔merchant — a single upstream application per merchant integrates with providers and posts domain commands.

## Actor Responsibilities
See [Domain Overview](knowledge/domain/00_domain_overview.md#roles--responsibilities) for detailed actor definitions and responsibilities.

---

## Lifecycle of a Purchase

**Merchant Isolation:** Each merchant has its own Supabase project. The `merchant_id` determines which Supabase project to connect to for data operations, ensuring complete data isolation.

### 1. Payment Settlement (Only)
- Upstream confirms success with provider.
- Upstream submits a **Purchase.Settled** event with:
  - User identifier (Supabase Auth id).
  - Product code.
  - **Pricing snapshot**: country of purchase, currency, amount (tax‑inclusive), optional VAT rate/note.
  - Order placed timestamp (`order_placed_at`) captured at checkout used for price validation.
  - External payment reference (provider txn id).
  - Settlement timestamp.
  - Idempotency key.
- Ledger validates the event, issues credit lot from product, creating credit ledger entry (with expiry per product) with `reason = purchase` and complete operation context (operation_type from payment method, resource_amount from pricing_snapshot, resource_unit from currency). Generates a receipt.

### 2. Refunds & Chargebacks
- **Refunds** are not supported in normal flow. All lots are non-refundable per business policy. Emergency refunds available via `Refund.Apply` for exceptional circumstances only as full transaction reversals.
- **Chargebacks** (provider‑initiated): control panel sends **Chargeback.Apply**. Ledger records `reason = chargeback` with operation context for full transaction reversal. Balance may go negative; workflow authorization handled by upstream applications.

### 3. Adjustments
- **Adjustment.Apply** (control panel): corrections outside refunds/chargebacks with operation context (operation_type: "manual_adjustment", resource_amount: abs(credits_delta), resource_unit: "CREDIT"); always compensating, never destructive edits.

---

## Failure & Edge‑Case Handling
- **Abandoned/failed payments**: outside the ledger; no events sent.
- **Duplicate/late events**: idempotency key and external reference prevent double issuance within 7-day operational window.
- **Partial captures**: are not allowed, units must match.
- **Over/under‑charge corrections**: are not allowed, units must match
- **Service SLA failure**: use `Adjustment.Apply` with justification through control panel.

---

## Reconciliation
- Source of truth: upstream’s confirmed settlements.
- Upstream may run daily reconciliation against provider reports and resubmit missing/corrective events.
- Ledger: accept idempotent events and maintain an immutable audit trail.

---

## Audit & Privacy
- Store only minimal references needed for audit: order id, external payment reference, settlement timestamp.
- Never store sensitive provider payloads or cardholder data in the ledger.

---

## Invariants
1. No credits exist without a settled purchase or a grant (starter/promo/adjustment).
2. Every `purchase` ledger entry has a matching receipt.
3. Chargebacks and adjustments are recorded as compensating entries; no destructive edits to past ledger lines.
4. The ledger is append‑only and idempotent: replaying the same event cannot change state twice within 7-day operational window.
5. Pricing snapshot validation uses `order_placed_at`: the product and price must be active/available at `order_placed_at`; settlement may proceed even if the product is archived at settlement time, provided the order was placed while the product was active.
