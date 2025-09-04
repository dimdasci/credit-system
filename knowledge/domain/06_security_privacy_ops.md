# Security, Privacy & Ops

---

## Security Boundaries
- **Auth Provider:** Supabase Auth per merchant. Each merchant operates with complete data isolation via separate Supabase projects. Deployment model: 1:1 application↔merchant; configuration is operational application config in this mode, while receipts snapshot all merchant fields.
- **Merchant Context:** Every command/query operates within merchant context determined by project routing. Complete data isolation between merchants.
- **Roles (per merchant):**
  - **User:** Can query own balance/history/receipts within their merchant context only.
  - **Upstream Application:** Can post settlements and debits for user operations, scoped to merchant project.
  - **Admin/Support:** Scoped to single merchant; manage catalog, grants, adjustments, account locks, search by external refs within merchant boundary.
  - **System Jobs:** Expiry and partition jobs run per merchant project independently.

---

## PCI DSS & Payment Data
- **Out of Scope:** Ledger never stores cardholder data. Payment integration is upstream.
- **Audit References Only:** Store `external_ref`, `amount`, `currency`, `country`, `settled_at`.
- **Per Merchant:** Each merchant decides which upstream provider(s) they integrate with; ledger only sees settled events.
- **Receipts:** Display truncated external reference only. Full ref stored as opaque audit token.

---

## Privacy (GDPR/Local Compliance)
- **Data Isolation:** Complete separation per merchant via Supabase projects. No cross-merchant data sharing or access.
- **Stored per Merchant:** `user_id` (Supabase Auth within merchant project), email (for receipts).
- **Data Minimization:** No billing addresses collected unless merchant explicitly enables invoicing (not at launch).
- **Data Export:** User can export own ledger and receipts within their merchant context via upstream application.
- **Deletion:** On account deletion, personal identifiers are erased within merchant project; ledger/receipts retained anonymized. `user_id` replaced with tombstone marker.
- **Retention:** Each merchant configures `retention_years` (≥ 7 recommended) independently.

---

## Abuse & Fraud Mitigation
- **Welcome Lot Farming:** One signup grant per `user_id` per merchant. Merchants may add per‑IP/device controls upstream.
- **Geo‑Pricing Bypass:** Country resolved from trusted edge headers at purchase. Merchant policies define enforcement.
- **Multi‑account Abuse:** Detection upstream; ledger can surface suspicious usage patterns by merchant.

---

## Observability
- **Tracing:** All commands/events tagged with `merchant_id`, `app_id`, `user_id`, and `command`.
- **Metrics (per merchant):**
  - Settled purchases
  - Debits processed
  - Expiries run
  - Negative balance events
  - Grants issued
- **Logs:** Admin/support actions logged with actor + merchant context.

---

## Ops & Runbooks
- **Expiry Job:** Nightly per merchant.
- **Partition Job:** Monthly, per merchant ledger.
- **Idempotency Cleanup:** Daily cleanup of idempotency tracking data older than 7 days per merchant.
- **Webhook Replay:** Upstream can resend settlement events with same idempotency key within 7-day window.
- **Receipt Re‑send:** Merchant support can trigger re‑email; same receipt number.
- **Disaster Recovery:** Regular backups; receipts/ledger reproducible from snapshots per merchant. Idempotency tracking recreated from recent operations only.

---

## Cross‑Spec Invariants
- **With Receipts & Tax:** Each receipt scoped to merchant config within isolated Supabase project.
- **With Ledger:** Ledger state completely isolated per merchant project.
- **With Queries:** Users see only data within their merchant context; no cross-merchant access possible.

---

## Implementation Notes
1. **Merchant_id assignment:** Manual configuration during merchant onboarding, separate from but mapped to Supabase project IDs.
2. **Service discovery:** HTTP headers or routing middleware determine merchant context and corresponding Supabase project connection.
3. **Log retention:** Should align with merchant-configured receipt retention for audit consistency.
4. **Deployment note:** In 1:1 app↔merchant deployments, operational configuration resides with the application; if moving to multi‑tenant, store merchant configuration per merchant database to preserve isolation and updatability.
