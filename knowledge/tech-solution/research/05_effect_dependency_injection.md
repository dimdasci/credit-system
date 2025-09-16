# Effect Dependency Injection & Service Composition

## 1. Modern Effect.Service Pattern

```typescript
// services/repositories/ProductRepository.ts
import { Effect } from 'effect'
import { DatabaseManager } from '../external/DatabaseManager.js'
import type { Product } from '../../domain/products/Product.js'

export class ProductRepository extends Effect.Service<ProductRepository>()("ProductRepository", {
  effect: Effect.gen(function* () {
    const db = yield* DatabaseManager
    
    return {
      createProduct: (product: Product) => 
        Effect.gen(function* () {
          const sql = yield* db.getConnection("default-merchant")
          return yield* sql`INSERT INTO products ${sql.insert(product)} RETURNING *`
        }),
        
      getActiveProducts: (distribution?: "sellable" | "grant") => 
        Effect.gen(function* () {
          const sql = yield* db.getConnection("default-merchant")
          return yield* sql`
            SELECT * FROM products 
            WHERE effective_at <= NOW() 
            AND archived_at IS NULL
            ${distribution ? sql`AND distribution = ${distribution}` : sql``}
            ORDER BY created_at DESC
          `
        })
    }
  }),
  dependencies: [DatabaseManager.Default]
}) {
  // Built-in mock for testing
  static readonly Mock = ProductRepository.make({
    createProduct: () => Effect.succeed(void 0),
    getActiveProducts: () => Effect.succeed([])
  })
}
```

## 2. Business Service Composition

```typescript
// services/business/LedgerService.ts - Business logic coordination
export class LedgerService extends Effect.Service<LedgerService>()("LedgerService", {
  effect: Effect.gen(function* () {
    const ledgerRepo = yield* LedgerRepository
    const productRepo = yield* ProductRepository
    
    return {
      processLotCreation: (userId: string, product: Product) =>
        Effect.gen(function* () {
          // Business validation
          yield* Effect.when(
            product.distribution === "grant",
            () => Effect.fail(new DomainError("Cannot purchase grant products"))
          )
          
          // Coordinate repository operations
          const lot = yield* ledgerRepo.createCreditLot(userId, product, {
            reason: "purchase",
            operationType: "purchase"
          })
          
          return lot
        }),
        
      processDebitOperation: (userId: string, operation: Operation) =>
        Effect.gen(function* () {
          // Select lots via FIFO (in SQL)
          const availableLots = yield* ledgerRepo.selectFIFOLots(
            userId, 
            operation.capturedRate * operation.resourceAmount
          )
          
          yield* Effect.when(
            availableLots.length === 0,
            () => Effect.fail(new DomainError("Insufficient credits"))
          )
          
          // Record debit entry
          return yield* ledgerRepo.recordDebit(userId, operation, availableLots[0].lotId)
        })
    }
  }),
  dependencies: [LedgerRepository.Default, ProductRepository.Default]
}) {
  static readonly Mock = LedgerService.make({
    processLotCreation: () => Effect.succeed({ lotId: "mock-lot", credits: 100 }),
    processDebitOperation: () => Effect.succeed({ entryId: "mock-entry", amount: -10 })
  })
}
```

## 3. Application Use Case Integration

```typescript
// application/use-cases/PurchaseCredits.ts
export class PurchaseCreditsUseCase extends Effect.Service<PurchaseCreditsUseCase>()("PurchaseCreditsUseCase", {
  effect: Effect.gen(function* () {
    const ledgerService = yield* LedgerService
    const productRepo = yield* ProductRepository
    const receiptService = yield* ReceiptService
    
    return {
      executePurchase: (input: PurchaseInput) =>
        Effect.gen(function* () {
          // Validate product availability
          const product = yield* productRepo.getProductByCode(input.productCode)
          yield* Effect.when(!product, () => Effect.fail(new DomainError("Product not found")))
          
          // Process credit lot creation
          const lot = yield* ledgerService.processLotCreation(input.userId, product)
          
          // Generate receipt
          const receipt = yield* receiptService.generatePurchaseReceipt(lot, input.paymentInfo)
          
          return { lot, receipt }
        })
    }
  }),
  dependencies: [LedgerService.Default, ProductRepository.Default, ReceiptService.Default]
}) {}
```

## 4. Testing with Effect.Service Mocks

```typescript
// test/services/business/LedgerService.test.ts
import { Effect, Layer } from "effect"
import { describe, it, expect } from "vitest"

describe("LedgerService", () => {
  // Unit test with mocks
  it("processes lot creation with business validation", () =>
    Effect.gen(function* () {
      const service = yield* LedgerService
      const result = yield* service.processLotCreation("user-123", mockProduct)
      
      expect(result.credits).toBe(mockProduct.credits)
      expect(result.userId).toBe("user-123")
    }).pipe(
      Effect.provide(LedgerService.Mock),
      Effect.runPromise
    )
  )
  
  // Integration test with real dependencies
  it("handles database operations correctly", () =>
    Effect.gen(function* () {
      const service = yield* LedgerService
      const result = yield* service.processLotCreation("user-123", realProduct)
      
      // Verify actual database state
      const repo = yield* LedgerRepository
      const balance = yield* repo.getUserBalance("user-123")
      expect(balance).toBe(realProduct.credits)
    }).pipe(
      Effect.provide(Layer.mergeAll(
        DatabaseManager.Live,
        LedgerRepository.Default,
        ProductRepository.Default,
        LedgerService.Default
      )),
      Effect.runPromise
    )
  )
})
```

## 5. Key Benefits of Effect.Service Pattern

### Development Benefits
- **Reduced Boilerplate**: Single class combines interface, implementation, and dependencies
- **Type Safety**: Full type checking across service boundaries with automatic inference
- **Built-in Mocking**: `.Mock` static property provides consistent test behavior
- **Dependency Auto-Resolution**: Dependencies automatically injected via `.Default` layers
- **Composability**: Services easily compose with other Effect.Service instances

### Architectural Benefits
- **Pragmatic Boundaries**: Clean separation without over-engineering
- **SQL-First Performance**: Database operations where they belong, not in-memory processing
- **Domain Focus**: Business concepts clearly separated from technical implementation
- **Effect Integration**: Native support for Effect patterns (errors, concurrency, resources)

### Testing Benefits
```typescript
// Easy unit testing with mocks
test("business logic", () =>
  Effect.gen(function* () {
    const service = yield* LedgerService
    const result = yield* service.processLotCreation(userId, product)
    expect(result.credits).toBe(product.credits)
  }).pipe(Effect.provide(LedgerService.Mock), Effect.runPromise)
)

// Integration testing with real services  
test("database integration", () =>
  Effect.gen(function* () {
    const service = yield* LedgerService
    const result = yield* service.processLotCreation(userId, product)
    // Test actual database state
  }).pipe(Effect.provide(LedgerService.Default), Effect.runPromise)
)
```

### Operational Benefits
- **Multi-tenant Isolation**: Merchant databases handled transparently via DatabaseManager
- **Resource Management**: Automatic connection pooling and cleanup
- **Error Handling**: Consistent domain error mapping across all services
- **Observability**: Built-in Effect telemetry and tracing support

This approach provides the benefits of modern Effect patterns while maintaining the pragmatic, business-focused architecture suitable for a lean credit ledger service.