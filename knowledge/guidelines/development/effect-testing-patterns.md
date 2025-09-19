# Effect Testing Patterns and Domain-Driven Test Design

## Purpose

This document captures essential patterns for testing Effect-based services, proper layer dependency management, and domain-driven test design. These patterns emerged from implementing the PurchaseSettlementService and resolving complex test isolation issues.

## Core Testing Principles

### 1. Domain Contract Testing vs Implementation Details

**Test the business contract, not the technical implementation.**

#### What TO Test (Domain Contract)
```typescript
// ✅ Success case: Verify proper service result type
const result = yield* service.settlePurchase(request)
expect(result.lot.initial_amount).toBe(1000) // Business property
expect(result.receipt.receipt_number).toMatch(/^R-AM-\d{4}-\d{4}$/) // Business format

// ✅ Failure case: Verify proper domain error type
const result = yield* service.settlePurchase(request).pipe(Effect.flip)
expect(result).toBeInstanceOf(ServiceUnavailable) // Domain error type
expect(result.reason).toBe("database_connection_failure") // Business reason
```

#### What NOT to Test (Implementation Details)
```typescript
// ❌ Don't test service attribution in errors
expect(result.service).toBe("PurchaseSettlementService")

// ❌ Don't test SQL query counts or database internals
expect(mockQueryContext.lastTransactionQueries).toHaveLength(1)
expect(mockQueryContext.transactionCallCount).toBe(1)

// ❌ Don't test mock state or technical tracking
expect(mockQueryContext.lastLedgerInsertValues).toBeNull()
expect(mockQueryContext.rollbackCalled).toBe(true)
```

#### Rationale: Service-Agnostic Domain Errors

Domain errors represent **business failure scenarios**, not technical attribution:

- **When operation succeeds**: Get service-typed result (`SettlementResult`)
- **When operation fails**: Get domain error (`ServiceUnavailable`, `ProductUnavailable`, etc.)

The specific service that threw the error is an implementation detail. What matters is the **business scenario** the error represents.

### 2. TDD Means Tests Drive Implementation, Not Arbitrary Assertions

**Tests should reflect intended business behavior, not convenient assertions.**

Tests must be based on:
- Domain requirements and business rules
- Intended service contracts and interfaces
- Real user scenarios and failure modes

Tests should NOT be based on:
- Making tests pass easily
- Testing whatever the current implementation happens to do
- Arbitrary technical requirements without business justification

## Effect Layer Management in Testing

### 3. Smart Dependency Configuration

**Configure dependencies at the right level of the architecture.**

#### Repository Layer: Dynamic Dependencies
```typescript
// ✅ Repositories should NOT have hardcoded dependencies
export class LedgerRepository extends Effect.Service<LedgerRepository>()(
  "LedgerRepository",
  {
    effect: Effect.gen(function*() {
      const db = yield* DatabaseManager // Dynamic dependency
      // ... repository implementation
    }),
    dependencies: [] // NO hardcoded dependencies here
  }
) {}
```

#### Business Service Layer: Hardcoded Dependencies
```typescript
// ✅ Business services can have hardcoded dependencies (final consumers)
export class PurchaseSettlementService extends Effect.Service<PurchaseSettlementService>()(
  "PurchaseSettlementService",
  {
    effect: Effect.gen(function*() {
      // ... service implementation
    }),
    dependencies: [
      LedgerRepository.Default,
      ProductRepository.Default,
      ReceiptRepository.Default
    ] // Hardcoded dependencies OK for final consumers
  }
) {}
```

#### Rationale: Flexibility vs Stability

- **Repositories need flexibility**: Must work with different database connections (test mocks, production DB, different merchants)
- **Business services need stability**: Final consumers with well-defined dependencies that rarely change

### 4. Effect Layer Isolation Patterns

#### Use Layer.fresh() for Test Isolation
```typescript
// ✅ Force non-memoized layers for test isolation
const mockDatabaseManagerLayer = Layer.fresh(
  Layer.succeed(DatabaseManager, {
    getConnection: (_merchantId: string) => Effect.succeed(createMockSql())
  })
)
```

#### Avoid Effect.provide Chaining
```typescript
// ❌ Don't chain Effect.provide calls - causes service lifecycle issues
return effect.pipe(Effect.provide(testLayer), Effect.provide(baseLayer))

// ✅ Merge layers and provide in single call
const mergedLayer = Layer.mergeAll(testLayer, baseLayer)
return effect.pipe(Effect.provide(mergedLayer))
```

#### Test Layer Factory Pattern
```typescript
// ✅ Create fresh layers per test execution
export const withTestLayer = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const mockDatabaseManagerLayer = Layer.fresh(
    Layer.succeed(DatabaseManager, {
      getConnection: (_merchantId: string) => Effect.succeed(createMockSql())
    })
  )

  const testLayer = Layer.mergeAll(
    mockDatabaseManagerLayer,
    Layer.provide(LedgerRepository.Default, mockDatabaseManagerLayer),
    Layer.provide(ProductRepository.Default, mockDatabaseManagerLayer)
  )

  return effect.pipe(Effect.provide(testLayer))
}
```

## Effect Testing Infrastructure

### 5. Mock Context Management

#### Proper Mock Context Reset
```typescript
// ✅ Use Object.assign for shared object mutation
export const resetMockQueryContext = () => {
  Object.assign(mockQueryContext, initialContext())
}

// ❌ Don't reassign - breaks context capture in layers
export const resetMockQueryContext = () => {
  mockQueryContext = initialContext() // Breaks closure references
}
```

### 6. Concurrent Execution Considerations

#### Layer Memoization and Race Conditions
Effect layers use reference equality for memoization. In concurrent test execution:

- **Layer.fresh()** forces creation of non-memoized layer instances
- **Shared mock contexts** can cause race conditions between concurrent tests
- **Sequential execution** (`--sequence.concurrent=false`) can help diagnose isolation issues

#### Test Isolation Debugging Strategy
```bash
# 1. Run individual test to verify it works in isolation
pnpm test --run -t "specific test name"

# 2. Run with sequential execution to check for shared state issues
pnpm test --run --sequence.concurrent=false

# 3. Run with default concurrent execution to verify final isolation
pnpm test --run
```

## Common Anti-Patterns and Solutions

### 7. Transaction Boundary Testing

#### ❌ Anti-Pattern: Testing Transaction Implementation
```typescript
// Don't test transaction mechanics
expect(mockQueryContext.transactionCallCount).toBe(1)
expect(mockQueryContext.commitCalled).toBe(true)
```

#### ✅ Pattern: Testing Business Atomicity
```typescript
// Test that operation either fully succeeds or fully fails
const result = yield* service.settlePurchase(validRequest)
expect(result.lot).toBeDefined() // Success: both lot and receipt created
expect(result.receipt).toBeDefined()

const failureResult = yield* service.settlePurchase(invalidRequest).pipe(Effect.flip)
expect(failureResult).toBeInstanceOf(ProductUnavailable) // Failure: proper domain error
```

### 8. Error Attribution Testing

#### ❌ Anti-Pattern: Testing Service Attribution
```typescript
// Don't test which service threw the error
expect(error.service).toBe("PurchaseSettlementService")
```

#### ✅ Pattern: Testing Business Error Scenarios
```typescript
// Test that proper domain error represents the business scenario
expect(error).toBeInstanceOf(ServiceUnavailable)
expect(error.reason).toBe("database_connection_failure")
// User/system knows what went wrong and how to handle it
```

## Test Organization Blueprint

### Recommended Directory Layout

Mirror the production screaming architecture so test intent is obvious:

```
apps/server/test/
├── domain/                          # Schema validation & invariants
│   └── credit-ledger/
│       ├── LedgerEntry.test.ts
│       └── Lot.test.ts
├── services/
│   ├── repositories/                # Effect.Service repository tests
│   │   ├── LedgerRepository.test.ts
│   │   └── ReceiptRepository.test.ts
│   ├── business/                    # Higher-level orchestration
│   └── integration/                 # Cross-service flows & transactions
├── fixtures/                        # Shared business fixtures
└── utils/                           # Helpers (Effect layers, SQL mocks)
```

Keep fixtures business-focused (products, operations, receipts) and reuse them across suites to avoid drifting assumptions.

### Test Categories

- **Domain Schema Tests**: Validate Effect Schema decoding, invariants, and domain error definitions.
- **Repository Tests**: Exercise SQL-first logic with the mocked SqlClient, verifying business projections over raw query text.
- **Business Service Tests**: Focus on orchestration contracts (inputs → outputs/errors) while relying on real repositories where practical.
- **Integration Smoke Tests**: Stitch repositories/services together to verify transaction boundaries, multi-tenant isolation, and composed workflows.

### Layering Guidelines (Recap)

1. Domain tests should not depend on Effect layers—use pure schema decoding.
2. Repository tests compose `DatabaseManager` mocks + real repository implementations.
3. Business service tests provide repositories through layers (often via the harness utilities) and assert domain results.
4. Integration tests can opt into broader layer stacks, but keep them sparing to preserve feedback speed.

### Test Execution Strategy

1. **Schema pass** – Fast validation ensuring domain invariants hold.
2. **Service pass** – Repository + business service suites using mocked SQL.
3. **Integration pass** – Targeted workflows (and, when available, real Postgres fixtures).

Document each layer’s expectations in test descriptions so failures immediately indicate the violated business rule.

## Key Learning Summary

### Technical Insights
1. **Effect.provide chaining causes service lifecycle issues** - merge layers instead
2. **Layer.fresh() prevents memoization-related test isolation problems**
3. **Repository dependencies should be dynamic, service dependencies can be static**
4. **Concurrent test execution amplifies isolation issues** - use as diagnostic tool

### Domain-Driven Testing Insights
1. **Domain errors are service-agnostic** - they represent business scenarios, not technical attribution
2. **Test the contract, not the implementation** - focus on business behavior, not technical mechanics
3. **TDD means tests drive implementation** - tests must reflect intended business behavior
4. **Implementation details should not leak into tests** - mock state, query counts, transaction mechanics are internal concerns

### Architectural Insights
1. **Smart dependency placement**: Dynamic at repository level, static at service level
2. **Layer composition patterns**: Fresh layers for isolation, merged layers for composition
3. **Error handling strategy**: Service ownership for orchestration, domain errors for business failures
4. **Test design philosophy**: Business contract verification over technical implementation testing

These patterns enable robust, maintainable Effect-based services with tests that clearly express business requirements while remaining resilient to implementation changes.
