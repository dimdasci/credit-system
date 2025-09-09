# 2. System Architecture Overview

## Purpose

Define a lean, provider‑agnostic system design for the Credit Management Service that a developer can implement directly. Focus on clear boundaries, multi‑tenant isolation, and minimal operational overhead.

## 2.1 Components & Boundaries

### Runtime Components
```
Apps
  server  – HTTP RPC server (Effect, Node)
  cli     – Admin/maintenance commands (local superadmin tool via RPC)

Packages
  rpc     – Request/response schemas and errors (@effect/schema)
  client  – RPC client factory (HTTP + JWT)
  shared  – Domain services, DB access, telemetry utilities
```

### Technology Stack
- Effect for service composition and typed errors
- Provider‑agnostic Postgres (one DB per merchant; no Supabase‑specific APIs)
- OpenTelemetry NodeSDK bridged to Sentry for traces/errors/profiles
- Container‑based deploy (Railway‑friendly but vendor‑neutral design)

## 2.2 Request, Trace, and Data Flow

```
Client → HTTP RPC → Auth (JWT sub) → Request Runtime
  → DB pool selection (MERCHANT_<ID>_DATABASE_URL)
  → Domain services (Ledger, Operation, Product)
  → Response (typed success | tagged error)

Tracing/Errors
  → Effect spans (Effect.fn / withSpan) → OpenTelemetry NodeSDK
  → SentrySpanProcessor → Sentry (traces + errors + profiles)
  → Scope tags: merchantId (from sub), request info
```

Key points:
- Per‑request runtime is enriched with merchant context and a tenant‑scoped DB pool.
- All business operations are pure or Effectful services with clear boundaries.
- Errors are captured with Sentry, preserving typed error semantics at boundaries.

## 2.3 Multi‑Tenant Strategy (Postgres)

Note: In JWTs, `sub` is the merchant’s id — the same identifier referred to in the domain as `merchant_id`.

- Isolation: one Postgres database per merchant.
- Routing: `sub` in JWT (merchant id) → select `MERCHANT_<UPPER_ID>_DATABASE_URL`.
- Resource control: connection pool per merchant; no cross‑tenant reuse.
- SQL only: no provider‑specific features required.
- Auditability: ledger is the source of truth; read models are optional.

Environment convention:
```
MERCHANT_ACME_DATABASE_URL=postgres://user:pass@host:5432/acme
MERCHANT_DEMO_DATABASE_URL=postgres://user:pass@host:5432/demo
```

## 2.4 Observability (Sentry + OpenTelemetry)

- NodeSDK with `SentrySpanProcessor` and `SentryPropagator` (100% sampling initially).
- `Effect.fn` for broad function‑level spans; `Effect.withSpan` on hot paths.
- Request middleware sets `merchantId` (derived from `sub`) and request tags.
- Effect cause capture helper forwards failures to Sentry.

Reference: see research “Sentry Integration (Effect + OpenTelemetry)”.

## 2.5 Deployment Topology

- Web service: single HTTP server process.
- Background jobs: run inside Postgres using pg_cron (per‑merchant DB). Jobs are created via migrations and execute stored procedures (expiry, cleanup, idempotency).
- Shared environment: JWT secret, Sentry DSN, per‑merchant DB URLs.
- Container image ships the server only. CLI runs locally and calls admin/control RPCs over HTTP to the server using admin authentication (no direct DB access).

Railway‑ready defaults without lock‑in (any container runtime works).

## 2.6 Configuration Surface

Required environment variables:
```
JWT_SECRET=...
SENTRY_DSN=...
NODE_ENV=development|production
SERVICE_NAME=credit-system
RAILWAY_GIT_COMMIT_SHA=...               # if available
MERCHANT_<ID>_DATABASE_URL=postgres://... # one per merchant
```

Operational defaults:
- Tracing/profile sampling: 100% at zero users; adjust later.
- Privacy: no PII in spans; use tags for searchable identifiers.
- Graceful shutdown: flush Sentry; `NodeSDK.shutdown()` on exit.

## 2.7 Monorepo Structure

```text
repo/
  apps/
    server/
    cli/
  packages/
    rpc/
    client/
    shared/
```

## 2.8 Figures

### Figure 2.1 — System Overview
```mermaid
flowchart LR
  C[Client] -->|JWT (sub)| G[HTTP RPC Server]
  subgraph Runtime
    G --> A[Auth + Merchant Context]
    A --> D[Domain Services]
    A --> T[Telemetry Layer\n(OpenTelemetry NodeSDK)]
  end
  D --> P[(Postgres\nper-merchant DB)]
  T --> S[Sentry\n(traces + errors + profiles)]
```

### Figure 2.2 — Monorepo Modules
```mermaid
graph TD
  A[apps/server] --> SRV[packages/shared]
  A --> RPC[packages/rpc]
  A --> CL[packages/client]
  B[apps/cli] --> SRV
  B --> RPC
  C[apps/cron] --> SRV
  C --> RPC
```

## 2.9 Implementation Notes

- Use `Effect.fn` widely to get spans on service methods; wrap critical sections with `Effect.withSpan` for attributes and nesting.
- Tenant context is set in middleware and provided via Effect layers to DB and services.
- RPC contracts are schema‑first; server and client share the same definitions.
- Keep DB schema and migrations per merchant; never cross tenant boundaries.

## 2.7 API Versioning

### Policy
- Header: `X-API-Version` with date value (YYYY-MM-DD), e.g., `2025-01-15`.
- Defaults: `DEFAULT_API_VERSION` used when header absent; `MIN_SUPPORTED_API_VERSION` rejects older requests.
- Scope: Versioning applies only to the RPC edge (contracts + router). Shared domain/services remain unversioned.
- Selection: Best match ≤ requested; otherwise return `UnsupportedApiVersion` with guidance.

### Repository Layout (versioned from day one)
- Start with versioned folders to avoid later renames:
  - `packages/rpc/src/contracts/`
    - `v2025_01_15/` (purchase.ts, operation.ts, grants.ts, admin.ts, queries.ts, receipts.ts, index.ts)
    - `latest.ts` (re‑exports current version)
  - `apps/server/src/rpc/routers/`
    - `v2025_01_15.ts` (wire handlers to v2025_01_15 contracts)
    - `registry.ts` (map `"2025-01-15" → v2025_01_15`)
  - `apps/server/src/rpc/middleware/`
    - `ApiVersionMiddleware.ts` (reads `X-API-Version`, validates, selects router)

### Middleware & Router Selection (sketch)
- `ApiVersionMiddleware` parses `X-API-Version` or uses default, ensures `>= MIN_SUPPORTED_API_VERSION`, provides `ApiVersionContext`.
- `RouterRegistry` returns the router for the best supported version ≤ requested.
- Handlers call shared services; only serialization/contracts differ per version.

### Client Defaults
- Client sets `X-API-Version` using configured `apiVersion` or defaults to server’s `DEFAULT_API_VERSION`.

### Deprecation
- Track `api_version` in logs/metrics.
- Announce new versions with changelog and target deprecation date; reject after grace period via `MIN_SUPPORTED_API_VERSION`.
