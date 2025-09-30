# Dependency Refactoring: Merchant-Scoped Composition

## Background
- Protected RPC handlers currently instantiate services (e.g. `PurchaseSettlementService`, repositories) during server startup.
- These services pull `MerchantContext` immediately, but the context is only provided after the `Authorization` middleware runs.
- This causes boot-time failures (`Service not found: MerchantContext`) and spreads context awareness across many modules.
- Public endpoints (health/version) do not require merchant-specific dependencies and should remain lightweight.

## Goal
- Separate environment setup for public vs. authorized requests so merchant-scoped dependencies are only built when a request supplies a merchant.
- Centralize `MerchantContext` usage so protected services receive merchant-aware helpers without reading the context directly.
- Preserve existing behaviour for public endpoints and protected business flows.

## Non-Goals
- No changes to RPC contracts, domain models, or database schemas.
- No new business logic; focus is on dependency composition and wiring.
- No auth changes beyond wiring; JWT verification stays as-is.

## Scope
- Server composition (`apps/server/src/server.ts`).
- Authorization middleware (`AuthorizationMiddleware.ts`).
- Merchant-aware services and repositories:
  - `PurchaseSettlementService`
  - `MerchantConfigService`
  - `LedgerRepository`, `ReceiptRepository`, `ProductRepository`, `OperationRepository`
  - Any other module selecting merchant-specific DB connections or config snapshots.
- Test harnesses and fixtures that currently provide `MerchantContext` directly.

## Approach
1. **Inventory Dependencies**
   - Categorize services into:
     - **Base layer**: safe to construct at startup (config provider, logger, `DatabaseManager`, etc.).
     - **Merchant layer**: requires `merchantId` (repositories, config snapshots, business services).
   - Document findings (README snippet or comments).

2. **Merchant Layer Factory**
   - Implement a helper (e.g. `MerchantRuntime.layerFor({ merchantId })`) returning a `Layer` that provides merchant-scoped abstractions:
     - DB accessor bound to the merchant’s schema/connection.
     - Merchant config snapshot service.
     - Repositories/business services rewritten to consume the scoped helpers instead of pulling `MerchantContext`.
   - Use `Layer.scoped`/`Layer.effect` so resources (connections) are released after each request.

3. **Server Composition**
   - In `server.ts`, keep a single base runtime built at startup.
   - For protected RPC groups, extend the middleware chain:
     - `Authorization` validates JWT and exposes `MerchantContext`.
     - Immediately convert that context into the merchant layer and provide it before invoking handlers.
   - Ensure public RPC groups only see the base layer.

4. **Service Refactors**
   - Update merchant-aware modules to accept scoped helpers via constructor/context provided by the merchant layer.
   - Remove direct `yield* MerchantContext` usage from these modules.
   - Ensure each method’s environment type reflects the new dependencies.

5. **Test Harness Updates**
   - Adjust repository/business service tests to provide the new merchant layer explicitly.
   - Keep base-only tests unchanged.
   - Add regression tests covering per-request provisioning if practical (e.g. verifying two different merchant IDs get isolated configs).

6. **Documentation**
   - Update knowledge base (architecture guidelines) to describe the layered runtime strategy and how to add new merchant-aware services.

## Deliverables
- Refactored server composition and merchant layer helper.
- Updated services/repositories without direct `MerchantContext` access.
- Passing `pnpm --filter @credit-system/server run check` and relevant tests.
- Updated test harnesses and docs.

## Acceptance Criteria
- Server boots without `Service not found: MerchantContext` errors.
- Public RPC handlers compile/run without requiring merchant-specific services.
- Protected handlers receive correct merchant-specific behaviour (DB selection, configs) during requests.
- Type checker confirms services no longer expose `MerchantContext` in their environments.
- Tests covering repositories/business flows pass against the new layering.

## Risks & Mitigations
- **Configuration leaks**: ensure merchant layer cleans up resources; use scoped layers.
- **Regression in tests**: update harnesses in lockstep to avoid brittle provisioning.
- **Hidden dependencies**: run `rg "MerchantContext"` post-change to verify no lingering direct lookups remain.

## References
- `apps/server/src/server.ts`
- `apps/server/src/application/rpc/middleware/AuthorizationMiddleware.ts`
- Current service implementations listed above.
- Effect docs: runtime and layering (`https://effect.website/docs/runtime`, `https://effect.website/docs/requirements-management/layers`).
