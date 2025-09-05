# Effect Dependency Injection & Service Composition

## 1. Service Definition Pattern

```typescript
// packages/shared/src/services/DatabaseService.ts
import { Context, Effect, Layer } from 'effect'
import { Pool } from 'pg'

interface DatabaseService {
  query<T>(sql: string, params?: unknown[]): Effect.Effect<T[], DatabaseError>
  transaction<A, E>(operation: Effect.Effect<A, E, DatabaseService>): Effect.Effect<A, E | DatabaseError, DatabaseService>
}

class DatabaseService extends Context.Tag('DatabaseService')<
  DatabaseService,
  DatabaseService
>() {}
```

## 2. Layer Composition for Multi-Tenant Architecture

```typescript
// Per-merchant database layer
const createMerchantDatabaseLive = (merchantId: string) =>
  Layer.scoped(
    DatabaseService,
    Effect.gen(function* () {
      const connectionString = process.env[`MERCHANT_${merchantId.toUpperCase()}_DATABASE_URL`]!
      
      // Scoped resource - automatically cleaned up
      const pool = yield* Effect.acquireRelease(
        Effect.tryPromise(() => new Pool({ 
          connectionString,
          max: 20,
          idleTimeoutMillis: 30000 
        })),
        (pool) => Effect.promise(() => pool.end())
      )
      
      return {
        query: <T>(sql: string, params: unknown[] = []) =>
          Effect.acquireUseRelease(
            Effect.tryPromise(() => pool.connect()),
            (client) => Effect.tryPromise(() => client.query(sql, params)),
            (client) => Effect.sync(() => client.release())
          ),
          
        transaction: <A, E>(operation: Effect.Effect<A, E, DatabaseService>) =>
          Effect.acquireUseRelease(
            Effect.tryPromise(() => pool.connect()),
            (client) => Effect.gen(function* () {
              yield* Effect.tryPromise(() => client.query('BEGIN'))
              try {
                const result = yield* operation
                yield* Effect.tryPromise(() => client.query('COMMIT'))
                return result
              } catch (error) {
                yield* Effect.tryPromise(() => client.query('ROLLBACK'))
                throw error
              }
            }),
            (client) => Effect.sync(() => client.release())
          )
      }
    })
  )
```

## 3. Business Service Composition

```typescript
// packages/shared/src/services/LedgerService.ts
interface LedgerService {
  createCreditLot(input: CreditLotInput): Effect.Effect<CreditLot, LedgerError>
  recordDebit(input: DebitInput): Effect.Effect<LedgerEntry, LedgerError>
  getBalance(userId: string): Effect.Effect<number, LedgerError>
}

class LedgerService extends Context.Tag('LedgerService')<
  LedgerService,
  LedgerService
>() {}

const LedgerServiceLive = Layer.effect(
  LedgerService,
  Effect.gen(function* () {
    const db = yield* DatabaseService
    
    return {
      createCreditLot: (input: CreditLotInput) =>
        db.transaction(
          Effect.gen(function* () {
            // Create ledger entry
            const entry = yield* db.query(
              'INSERT INTO ledger_entries (user_id, amount, reason, operation_type) VALUES ($1, $2, $3, $4) RETURNING *',
              [input.userId, input.credits, 'purchase', input.operationType]
            )
            
            // Update balance cache
            yield* db.query(
              'INSERT INTO user_balance (user_id, balance) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET balance = user_balance.balance + $2',
              [input.userId, input.credits]
            )
            
            return entry[0]
          })
        ),
        
      getBalance: (userId: string) =>
        Effect.gen(function* () {
          const result = yield* db.query(
            'SELECT balance FROM user_balance WHERE user_id = $1',
            [userId]
          )
          return result[0]?.balance || 0
        })
    }
  })
)
```

## 4. Merchant Context Management

```typescript
// Request-scoped merchant context
interface MerchantContext {
  merchantId: string
  databaseService: DatabaseService
}

class MerchantContext extends Context.Tag('MerchantContext')<
  MerchantContext,
  MerchantContext
>() {}

// JWT Middleware creates merchant-scoped context
export const withMerchantContext = <A, E, R>(
  merchantId: string,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => {
  const merchantLayer = createMerchantDatabaseLive(merchantId).pipe(
    Layer.provide(LedgerServiceLive)
  )
  
  return effect.pipe(Effect.provide(merchantLayer))
}
```

## 5. Runtime Management

```typescript
// apps/server/src/runtime/AppRuntime.ts
import { ManagedRuntime } from 'effect'

// Application-scoped services
const AppServicesLive = Layer.mergeAll(
  ConfigServiceLive,
  LoggerServiceLive,
  JwtServiceLive
)

// Create managed runtime
export const AppRuntime = ManagedRuntime.make(AppServicesLive)

// Per-request runtime with merchant context
export const createMerchantRuntime = (merchantId: string) => {
  const MerchantServicesLive = createMerchantDatabaseLive(merchantId).pipe(
    Layer.provide(LedgerServiceLive),
    Layer.provide(OperationServiceLive),
    Layer.provide(AppServicesLive)
  )
  
  return ManagedRuntime.make(MerchantServicesLive)
}
```

## 6. HTTP Handler Integration

```typescript
// apps/server/src/handlers/PurchaseHandler.ts
export const purchaseSettledHandler = (input: PurchaseSettledInput) =>
  Effect.gen(function* () {
    const ledgerService = yield* LedgerService
    const operationService = yield* OperationService
    
    // Business logic with automatic service injection
    const creditLot = yield* ledgerService.createCreditLot({
      userId: input.userId,
      credits: input.credits,
      operationType: 'purchase'
    })
    
    const receipt = yield* operationService.generateReceipt(creditLot)
    
    return { lotId: creditLot.id, receiptId: receipt.id }
  })

// RPC router with merchant context
export const purchaseRouter = RpcRouter.make(
  Rpc.effect(PurchaseSettled, ({ payload, merchantId }) =>
    purchaseSettledHandler(payload).pipe(
      withMerchantContext(merchantId)
    )
  )
)
```

## 7. Resource Cleanup & Error Handling

```typescript
// Automatic resource cleanup with Scope
const withDatabaseTransaction = <A, E>(
  operation: Effect.Effect<A, E, DatabaseService>
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const db = yield* DatabaseService
      return yield* db.transaction(operation)
    })
  )

// Usage - resources automatically cleaned up
const createPurchase = (input: PurchaseInput) =>
  withDatabaseTransaction(
    Effect.gen(function* () {
      // All database operations in single transaction
      const lot = yield* createCreditLot(input)
      const receipt = yield* generateReceipt(lot)
      const balance = yield* updateBalance(input.userId, input.credits)
      
      return { lot, receipt, balance }
    })
  )
```

## 8. Testing with Mock Services

```typescript
// Mock service for testing
const MockDatabaseServiceLive = Layer.succeed(DatabaseService, {
  query: <T>(sql: string, params?: unknown[]) =>
    Effect.succeed([{ id: 1, result: 'mock' }] as T[]),
    
  transaction: <A, E>(operation: Effect.Effect<A, E, DatabaseService>) =>
    operation
})

// Test with mock dependencies
const testPurchaseFlow = Effect.gen(function* () {
  const result = yield* purchaseSettledHandler(mockInput)
  expect(result.lotId).toBeDefined()
}).pipe(
  Effect.provide(MockDatabaseServiceLive),
  Effect.provide(MockLedgerServiceLive)
)
```

## Key Benefits

- **Automatic Dependency Resolution**: Services injected based on context
- **Resource Safety**: Scoped resources with automatic cleanup
- **Request Isolation**: Per-merchant context without global state
- **Testability**: Easy to mock services for testing
- **Type Safety**: Full type checking across service boundaries