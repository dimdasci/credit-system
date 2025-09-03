# Product & Pricing Spec

## Purpose
Define what a **Product (lot template)** is, how geographic pricing works, how offers are presented, and the rules that connect products to lot creation events (signup, purchase, manual grant).

---

## Core Concepts
- **Product (Lot Template):** `product_code`, `title`, `credits`, `access_period_days`.
- **Distribution:** `sellable | grant` (a product may be one or the other; grant products have **no prices** and can't be sold).
- **Grant Policy (optional, grant products only):** `apply_on_signup` | `manual_grant` (no co-issuance policies)
- **Effective Dates:** `effective_at`, `archived_at` (optional, if not specified it means no expiration. Might be set later)
- **Price Rows (sellable only):** Country‑specific or fallback; amounts are tax‑inclusive; optional VAT info.
- **Availability:** A sellable product is available in a country if a country or fallback price exists.

**Product Immutability:** Products (lot templates) are immutable once created, except for the `archived_at` field which can be updated if its current value is null or in the future. Price changes require creating a new product with updated pricing and using `effective_at`/`archived_at` to control the transition. This ensures pricing snapshots remain stable for audit and receipt generation.

---

## Catalog
- Launch: **Junior, Middle, Senior** as `sellable` products. One or more **grant** products can be defined (e.g., `welcome`, `promoX`), each with its own credits and access period.
- Grant product credits/access are defined on the product; **no upfront choice** outside the product itself is required.

---

## Geographic Pricing Policy (sellable)
- **Country of purchase** decided upstream at checkout (e.g., Cloudflare CF-IPCountry header).
- **Selection order:** 
  1. Country-specific price (e.g., `country: "AM"`)
  2. Fallback price (`country: "*"`)  
  3. Not for sale (no matching price rows)
- **Currency & tax:** Amounts are **tax‑inclusive**. Tax breakdown derived from merchant-level tax regime configuration.

---

## Presentation & Query
- Purchasing UI calls **`ListAvailableProducts(country)`** to render offers. Grant products are excluded.
- **Cross‑doc invariant:** The `pricing_snapshot` used in `Purchase.Settled` MUST match one item from `ListAvailableProducts(country)` at that moment.

---

## Issuance Mappings (Events → Lots)
- **On Signup:** Create credit entry from each **active grant product** with `apply_on_signup = true` (once per user, respecting limits).
- **On Purchase Settlement:** Always create credit entry from the **purchased sellable product** at full value.
- **Manual Grant:** Admins may create credit entry from any grant product that has `manual_grant = true`.

---

## Expiry & Access (recap)
- Every lot (sellable or grant) expires after its product’s `access_period_days` window.
- Workflow authorization based on balance is managed by upstream applications, not the Credit Management Service. Users always retain data access/export capabilities.

---

## Versioning
- Product templates are immutable. All changes require a new product template with `effective_at`/`archived_at` lifecycle management to control when changes take effect.

---

## Tax Configuration
- **Merchant-level:** Each merchant defines tax regime (`turnover`, `vat`, `none`) with optional VAT rate and display note.
- **Price-level:** Tax breakdown computed from merchant configuration when needed for receipts and display.
- **Fallback pricing:** Use `country: "*"` for universal fallback pricing when country-specific prices are unavailable.

