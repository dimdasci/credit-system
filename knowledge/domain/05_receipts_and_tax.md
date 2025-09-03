# Receipts & Tax

---

## Merchant Config
Each merchant has its own configuration stored within their isolated Supabase project. Fields include:
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
- Merchant config is stable after creation. Rare updates (address, contact info) apply immediately to new receipts; existing receipts remain unchanged.
- Each merchant maintains its own receipt sequence; numbers are never shared across merchants.
- Receipt generation for each merchant uses only that merchant's current config.

---

## Document Types
- **Receipt (standard):** Issued once per settled purchase. One per `purchase` ledger entry.
- **No refunds supported.**
- **No chargeback documents.** Chargebacks are ledger events, visible in control panel, not user‑facing.

---

## Receipt Issuance Rules
1. **Trigger:** During `Purchase.Settled` event processing, after successful credit entry creation.
2. **Uniqueness:** Exactly one receipt per `purchase` ledger entry.
3. **Numbering:** `Prefix-YYYY-####`. Prefix = `receipt_series_prefix` from merchant config.
4. **Re‑issue:** Allowed with same number; note “Re‑issued on <date>”.
5. **Corrections:** No retroactive edits. Chargebacks logged separately.

---

## Required Receipt Fields (Per Merchant)
**Header**
- Merchant legal name, registered address, country.
- Tax status line from config.
- Merchant contact email/URL.

**Buyer**
- User email (from Supabase Auth).

**Transaction**
- Receipt number.
- Issue date/time (ISO‑8601 UTC).
- External payment reference (provider txn id, truncated for display).
- Product code & title.
- Amount & currency.
- Tax breakdown (when applicable): `{ type, rate?, amount?, note? }` derived from merchant tax regime.
- Country of purchase (from snapshot).
- Credits issued & lot access period.
- Lot reference (lot_id for audit trail).

**Footer**
- Refund policy summary: "All purchases final – non‑refundable. Emergency refunds at merchant discretion."
- Privacy line (link to merchant policy).

---

## Chargebacks (Regulatory Note)
- Bank/acquirer‑initiated reversals, outside application control.
- Recorded in ledger as `reason = chargeback`.
- Visible in merchant control panel for reconciliation.
- No user‑facing document.

---

## Language & Localization
- Default language: English.
- Currency formatting per pricing snapshot.
- Times in UTC with offset.

---

## Delivery & Access
- Credit service generates PDF receipt during Purchase.Settled transaction.
- Upstream application handles receipt delivery to users (email, download, etc.).

---

## Retention & Privacy
- Retain receipts ≥ `retention_years` as set in merchant config.
- Receipts retain merchant identity and minimal buyer identity.
- No cardholder data stored.

---

## Cross‑Spec Invariants
- With **Purchases & Payments:** One receipt per settled purchase, scoped by merchant. Receipt PDF generation is part of atomic Purchase.Settled transaction; delivery handled by upstream application.
- With **Ledger:** Every `purchase` ledger entry generates exactly one receipt. Chargebacks/adjustments logged separately; receipts immutable. Receipt includes lot_id for audit trail connection.
- With **Product & Pricing:** Receipts display product information and pricing snapshot data (amount, currency, country) from purchase settlement.
- With **Merchant Config:** Receipt format, numbering, and tax display use merchant-specific configuration. Tax handling supports turnover regime (Armenia) with EU VAT extension capability.
- With **Queries:** `ListReceipts` returns purchase receipts for the given merchant; numbering sequence scoped per merchant.

---

**Note:** Receipt series prefix and retention years are merchant configuration decisions made at merchant setup time, not system-wide policies.

