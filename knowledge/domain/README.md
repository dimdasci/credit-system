# Credit Management Service Domain Overview

## Purpose
Provide a high-level map of the multi-merchant credit management service domain. This document is the **entry point**; it outlines architecture, scope, actors, and invariants, and points to detailed specs for each subdomain.

---

## Architecture
A **monolith credit management service** supporting multiple merchants with complete data isolation. The service handles the complete credit lifecycle: product catalog, pricing, ledger accounting, consumption tracking, receipts, and operational analytics. Each merchant operates independently with their own database, ensuring complete data and operational isolation.

**Service Composition:**
- **Product Catalog Module:** Product definitions, pricing, lifecycle management
- **Ledger Module:** Credit lots, balance calculation, FIFO consumption, debt handling
- **Receipt Module:** Document generation, tax calculation, receipt formatting
- **Operation Module:** Workflow tracking, resource-to-credit conversion, rate management
- **Shared Infrastructure:** Merchant isolation, merchant configuration, audit trails, background jobs

---

## Scope
A **multi-merchant credit management platform** for prepaid credits with complete operational lifecycle support. Each merchant operates as an independent business entity with complete data isolation via separate databases. Each merchant defines its own products, prices, operation rates, grants, and legal configuration. 

**Architecture**: 1:1 application-to-merchant relationship where each merchant operates through a single dedicated upstream application that interacts via provider-agnostic commands and queries.

---

## Core Domain Concepts
- **Merchant:** Independent legal entity with its own database, catalog, operation rates, receipt config, tax regime, and complete data isolation.
- **Product:** Immutable lot template with `credits`, `access_period_days`, and pricing. Distribution = `sellable` or `grant`. Product-price combinations have `effective_at` and `archived_at` lifecycle.
- **Operation Type:** Immutable resource-to-credit conversion specification with `operation_code`, `resource_unit`, `credits_per_unit`. Single active version per operation code with sequential lifecycle.
- **Workflow:** User-facing unit of work that consumes credits through multiple atomic operations over time. Workflows may span multiple days/sessions.
- **Operation:** Atomic consumption event that converts measurable resource usage (tokens, time, API calls) to credit debits with workflow context.
- **Operation Lifecycle:** Two-phase protocol ensuring controlled resource consumption: `Operation.Open` reserves operation slot and validates balance; `Operation.RecordAndClose` records debit and closes operation.
- **Grant Policy:** Defines if a grant product issues on signup (`apply_on_signup`) or can be manually granted (`manual_grant`). No co-issuance policies.
- **Lot:** Credit ledger entry created from a product template. Always created at full value regardless of user's debt status.
- **Ledger:** Append-only history of credit movements with complete operation context. Every entry includes `operation_type`, `resource_amount`, `resource_unit`, and optional `workflow_id`. Balance calculated as sum of all entries.
- **Receipt:** User-facing document generated once per purchase, scoped to merchant.

---

## Actors
- **User:** Buys credits, initiates workflows, queries balance/history/receipts.
- **Upstream Application:** Single B2C SMB application handling complete user journey (checkout, purchase settlements, workflow execution, operation debits).
- **Control App**: Owns management of merchants, user roles, products, and manual commands like granting lots, refunds, chargebacks.
- **Admin/Support:** Manages product catalog, operation rates, issues grants, resolves disputes.
- **System Jobs:** Expiry runs, partition creation, rate transitions.

### Roles & Responsibilities

#### Upstream Application
- Single B2C SMB application handling complete user journey.
- Owns checkout and integrates with payment providers.
- Computes or fetches pricing, presents offers, initiates payments, provides receipts to Users.
- Validates payment success with providers.
- Executes user workflows and records resource consumption using two-phase operation protocol.
- Emits user-initiated domain events to the ledger: **Purchase.Settled**, **Operation.Open**, **Operation.RecordAndClose**.

#### Control App (Admin/Support)
- Handles administrative and exceptional events: **Refund.Apply**, **Chargeback.Apply**, **Adjustment.Apply**.
- Manages merchant configuration, product catalog, and manual operations.
- Provides admin interfaces for dispute resolution and account management.

#### Credit Management Service
- Source of truth for credits, lots, ledger history, and receipts.
- Accepts user events from upstream application and administrative events from control app.
- Issues lots, writes ledger entries, generates receipts.
- Stores minimal audit references (order id, provider ref). Never stores sensitive payment data.

---

## Invariants
1. Ledger is immutable and idempotent; corrections use compensating entries.
2. Balance = sum of ledger entries. Negative balance allowed after operations start; new operations require balance >= 0.
3. Every ledger entry includes complete operation context: operation_type, resource_amount, resource_unit.
4. Operation types have single active version per merchant with sequential lifecycle (no overlapping effective periods).
5. All debit entries include complete operation context; operations follow two-phase protocol with immediate debiting. Optional workflow_id supports external aggregation patterns.
6. Operation concurrency control: Single open operation per (merchant_id, user_id) prevents race conditions.
7. Every purchase issues one receipt; grants never issue receipts.
8. Merchant config defines legal details, receipt series, tax regime, operation rates, operation timeout, and retention policy.
9. Queries must reflect ledger truth: `GetBalance` = sum of `GetLedgerHistory`.
10. All operations scoped by merchant_id; complete data isolation between merchants.
11. Product and operation type effective dates must be present or future, never past.

---

## Document Map
- **[01_product_pricing_spec.md](knowledge/domain/01_product_pricing_spec.md)** — product definitions, pricing policy, grant products.
- **[02_purchases_and_payments_boundary.md](knowledge/domain/02_purchases_and_payments_boundary.md)** — provider-agnostic purchase settlement flow.
- **[03_ledger_and_balance_invariants.md](knowledge/domain/03_ledger_and_balance_invariants.md)** — issuance, consumption, expiry, balance rules with operation context.
- **[04_operation_type_catalog.md](knowledge/domain/04_operation_type_catalog.md)** — operation type specifications, rate management, merchant configuration.
- **[05_receipts_and_tax.md](knowledge/domain/05_receipts_and_tax.md)** — receipt format, numbering, tax posture, merchant config.
- **[06_security_privacy_ops.md](knowledge/domain/06_security_privacy_ops.md)** — roles, PCI scope, GDPR, observability, ops runbooks.
- **[07_domain_command_catalog.md](knowledge/domain/07_domain_command_catalog.md)** — write-side commands including operation type management.
- **[08_queries_and_shapes.md](knowledge/domain/08_queries_and_shapes.md)** — read-side queries (balance, lots, history, receipts, operation types).
- **[09_idempotency_requirements.md](knowledge/domain/09_idempotency_requirements.md)** — idempotency guarantees and requirements.

---

## Service Boundaries

### In Scope (Credit Management Service)
- **Product catalog management** with immutable pricing lifecycle
- **Operation type catalog** with resource-to-credit conversion rates
- **Ledger accounting** with complete operation audit trail
- **Receipt generation** with merchant-specific tax and legal configuration
- **Balance calculation** with overdraft support and FIFO consumption
- **Workflow consumption tracking** with atomic operation debiting
- **Merchant isolation** via separate databases

### Out of Scope (Upstream Applications)
- **Payment provider integration** (Ameriabank, PayPal, etc.)
- **Workflow execution** and business logic
- **User authentication and authorization** (handled by upstream application’s auth provider)
- **Workflow-level aggregation** for user interfaces
- **Business intelligence and analytics** beyond operational reporting
- **Customer support tooling** beyond basic account overview

---

## Usage
- Use this overview to onboard new team members to the credit management service.
- For implementation, always consult the detailed document matching your service module.
- This service provides APIs for upstream applications; it does not include user-facing interfaces.

