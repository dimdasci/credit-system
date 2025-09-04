# Receipts & Tax

---

## Merchant Config
Each merchant has its own configuration. In 1:1 application↔merchant deployments, configuration is maintained as operational application config (rarely changing). Receipt creation snapshots all merchant fields needed for documents, and receipt numbering uses a per‑merchant database sequence inside the same transaction as Purchase.Settled. In multi‑tenant deployments, configuration is stored within each merchant’s isolated Supabase project. Fields include:
- `merchant_id` (stable identifier, maps to Supabase project)
- `legal_name`
- `registered_address`
- `country`
- `tax_regime`: `turnover|vat|none`
- `vat_rate?` (percentage, when tax_regime=vat)
- `tax_status_note` (e.g., "VAT not applicable – Turnover tax regime.")
- `contact_email`
- `receipt_series_prefix` (e.g., `R-AM`, `R-ES`) — used in numbering
- `retention_years` (≥ 7 recommended)
- `operation_timeout_minutes` (default: 15, configurable timeout for operation cleanup)

**Tax Handling:**
- **Armenia (Initial Support):** `tax_regime=turnover` with fixed global tax status note. No VAT calculations required regardless of customer location.
- **EU VAT (Future Extension):** `tax_regime=vat` with dynamic rates based on pricing snapshot country. Supports destination-based VAT for EU customers.
- **Tax Display:** Receipt shows tax information from pricing snapshot (what was actually charged) combined with merchant tax status note.

**Rules:**
- Merchant config is stable after creation. Rare updates (address, contact info) apply to new operations; existing receipts remain unchanged due to snapshotting.
- Each merchant maintains its own receipt sequence (database sequence/counter), incremented atomically with the purchase; numbers are never shared across merchants.
- Receipt generation uses the snapshot stored with the receipt, not the current config.

---

## Document Types
- **Receipt (standard):** Issued once per settled purchase. One per `purchase` ledger entry.
- **No refunds supported.**
- **No chargeback documents.** Chargebacks are ledger events, visible in control panel, not user‑facing.

---

## Receipt Record Creation Rules
1. **Trigger:** During `Purchase.Settled` event processing, after successful credit entry creation.
2. **Uniqueness:** Exactly one receipt record per `purchase` ledger entry.
3. **Numbering:** `Prefix-YYYY-####`. Prefix = `receipt_series_prefix` from merchant config.
4. **PDF Generation:** out of scope of the system. Upstream applications is responsible for rendering PDF using receipt record data.
5. **Corrections:** No retroactive edits to receipt records. Chargebacks logged separately.

---

## Receipt Record Data Structure
Receipt records contain all data required for consistent PDF generation:

**Merchant Context** (snapshot at purchase time)
- Merchant legal name, registered address, country
- Tax status line from config
- Merchant contact email/URL
- Receipt series prefix and numbering

**Buyer Information**
- User email (from Supabase Auth)

**Transaction Data**
- Receipt number (generated using merchant prefix)
- Issue date/time (ISO‑8601 UTC)
- External payment reference (provider txn id)
- Product code & title (from product template)
- Amount & currency (from pricing snapshot)
- Tax breakdown: `{ type, rate?, amount?, note? }` (from merchant tax regime at purchase time)
- Country of purchase (from upstream service on a moment of purchase)
- Credits issued & lot access period
- Lot reference (lot_id for audit trail)

---

## Chargebacks (Regulatory Note)
- Bank/acquirer‑initiated reversals, outside application control.
- Recorded in ledger as `reason = chargeback`.
- Visible in merchant control panel for reconciliation.
- No user‑facing document.

---

## PDF Generation & Delivery
- Credit service creates receipt record during Purchase.Settled transaction.
- Credit service returns receipt data to upstream application.
- Upstream applications generate PDF on-demand using receipt record data and handle delivery (email, download, etc.).

---

## Retention & Privacy
- Retain receipt records ≥ `retention_years` as set in merchant config.
- Receipt records retain merchant identity and minimal buyer identity.
- No cardholder data stored in receipt records.
- PDF storage and retention handled by upstream applications per their policies.

---

## Cross‑Spec Invariants
- With **Purchases & Payments:** One receipt record per settled purchase, scoped by merchant. Receipt record creation is part of atomic Purchase.Settled transaction; PDF generation and delivery handled by upstream application.
- With **Ledger:** Every `purchase` ledger entry generates exactly one receipt record. Chargebacks/adjustments logged separately; receipt records immutable. Receipt record includes lot_id for audit trail connection.
- With **Product & Pricing:** Receipt records contain product information and pricing snapshot data (amount, currency, country) from purchase settlement for consistent PDF generation.
- With **Merchant Config:** Receipt record includes merchant configuration snapshot at purchase time. Tax handling supports turnover regime (Armenia) with EU VAT extension capability.
- With **Queries:** `ListReceipts` returns receipt records for the given merchant; numbering sequence scoped per merchant. Upstream applications use receipt data for PDF generation.

---

**Note:** Receipt series prefix and retention years are merchant configuration decisions made at merchant setup time, not system-wide policies.
