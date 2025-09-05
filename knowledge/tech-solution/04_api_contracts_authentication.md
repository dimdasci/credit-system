# 4. API Contracts & Authentication

## Purpose

Define comprehensive API contracts and authentication mechanisms for the Credit Management Service, providing type-safe RPC schemas and JWT-based multi-tenant authentication. This section enables upstream applications to integrate securely with complete type safety and error handling.

## 4.1 RPC Schema & Authentication

### Core RPC Architecture

The Credit Management Service implements Effect RPC with type-safe contracts and JWT-based authentication, following the architectural decisions established in [brief.md](brief.md).

**Research Foundation**: Based on [02_effect_rpc_implementation.md](research/02_effect_rpc_implementation.md) and authentication patterns from the technical brief.

### API Versioning

- Header: `X-API-Version` with date value `YYYY-MM-DD` (e.g., `2025-01-15`).
- Defaults: If missing, the server applies `DEFAULT_API_VERSION`. Requests older than `MIN_SUPPORTED_API_VERSION` are rejected.
- Scope: Versioning applies only to the RPC edge (contracts + router). Shared domain and services remain unversioned.
- Selection: Best match ≤ requested; otherwise `UnsupportedApiVersion` with upgrade guidance.

Server middleware (sketch):
```typescript
// packages/server/src/rpc/middleware/ApiVersionMiddleware.ts
export const ApiVersionContext = Context.Tag("ApiVersionContext")<
  ApiVersionContext,
  { requested: string; effective: string }
>()

export const ApiVersionMiddleware = <R, E, A>(
  handler: (request: Request.Request<E, A>) => Effect.Effect<A, E, R>
) => (request: Request.Request<E, A>) =>
  Effect.gen(function* (_) {
    const req = yield* _(HttpServerRequest.HttpServerRequest)
    const requested = req.headers["x-api-version"] as string | undefined
    const defaultV = yield* _(Config.string("DEFAULT_API_VERSION"))
    const minV = yield* _(Config.string("MIN_SUPPORTED_API_VERSION"))
    const version = (requested ?? defaultV)
    if (version < minV) {
      yield* _(Effect.fail({
        _tag: "UnsupportedApiVersion",
        requested: version,
        minSupported: minV,
        latest: defaultV
      } as const))
    }
    return yield* _(
      handler(request).pipe(
        Effect.provideService(ApiVersionContext, { requested: requested ?? defaultV, effective: version })
      )
    )
  })
```

Versioned router registry (sketch):
```typescript
// apps/server/src/rpc/routers/registry.ts
const ROUTERS: Record<string, Router.Router<any>> = {
  "2025-01-15": router_v2025_01_15
}

export const selectRouter = (requested: string): Router.Router<any> => {
  // For N versions: pick the greatest version ≤ requested
  const versions = Object.keys(ROUTERS).sort()
  const selected = versions.filter(v => v <= requested).pop() ?? versions[versions.length - 1]
  return ROUTERS[selected]
}
```

### Idempotency Header

- Header: `Idempotency-Key` (required for all write commands)
- Scope: Key uniqueness is enforced per `{merchant_id} + {command_type}` within a 7-day window.
- Commands: `Purchase.Settled`, `Operation.Open`, `Operation.RecordAndClose`, `Grant.Apply`, `CreditAdjustment.Apply`, `Refund.Apply`, `Chargeback.Apply`.
- Behavior:
  - First request: server creates a PENDING record, processes, then stores result as `SUCCEEDED` (or a terminal failure state).
  - Duplicate while processing: server may return a typed error indicating in-progress with a short retry hint (implementation detail), without duplicating effects.
  - Duplicate after success: server returns the original materialized result (exact same payload) with success.
  - Conflicting duplicate (same key, different parameters): server returns a typed error describing the conflict; no state change occurs.
- Internal mapping: Transaction ID is derived deterministically, e.g. `uuidv5(merchant_id + ':' + command_type + ':' + idempotency_key)`. Storage retains records for 7 days for de-duplication.

Client usage example (HTTP transport):
```http
POST /rpc HTTP/1.1
Authorization: Bearer <jwt>
Idempotency-Key: 01J9QG6W8C6Q6ZWT8KQGZT3W7E  
X-API-Version: 2025-01-15
Content-Type: application/json

{ "_tag": "PurchaseSettled", "input": { /* ... */ } }
```

Server integration outline:
```typescript
// Pseudocode inside handler wrapper for write commands
const idemKey = request.headers.get('Idempotency-Key')
assert(idemKey, 'Idempotency-Key required for write commands')
const txId = uuidv5(`${merchantId}:${commandType}:${idemKey}`, NAMESPACE)
const record = await idemStore.get(txId)
if (record?.state === 'SUCCEEDED') return record.result
if (record?.state === 'FAILED_FINAL') throw record.error
if (record?.state === 'PENDING') throw new IdempotencyInProgress({ retryAfter: '5s' })
await idemStore.setPending(txId, { merchantId, commandType })
try {
  const result = await process()
  await idemStore.setSuccess(txId, result)
  return result
} catch (e) {
  const final = isRetriable(e) ? 'FAILED_RETRIABLE' : 'FAILED_FINAL'
  await idemStore.setFailure(txId, final, e)
  throw e
}
```

### Purchase Settlement Contracts

#### Purchase.Settled Command Schema
```typescript
// packages/rpc/src/schemas/PurchaseContracts.ts
import { Schema } from "@effect/schema"
import { Request } from "@effect/rpc"

export const PurchaseSettledInput = Schema.Struct({
  userId: Schema.String,
  productCode: Schema.String,
  settlementData: Schema.Struct({
    externalRef: Schema.String, // Payment provider reference
    orderPlacedAt: Schema.Date,
    settledAt: Schema.Date,
    pricingSnapshot: Schema.Struct({
      country: Schema.String, // ISO-3166-1 alpha-2
      currency: Schema.String,
      amount: Schema.Number,
      taxBreakdown: Schema.optional(Schema.Struct({
        type: Schema.Literal("vat", "turnover", "none"),
        rate: Schema.optional(Schema.Number),
        amount: Schema.optional(Schema.Number),
        note: Schema.optional(Schema.String)
      }))
    })
  })
})

export const PurchaseSettledSuccess = Schema.Struct({
  lot: Schema.Struct({
    lotId: Schema.String,
    creditsTotal: Schema.Int,
    creditsRemaining: Schema.Int,
    expiresAt: Schema.Date,
    issuedAt: Schema.Date
  }),
  receipt: Schema.Struct({
    receiptId: Schema.String,
    receiptNumber: Schema.String, // "R-ACME-2025-0001"
    issuedAt: Schema.Date,
    downloadUrl: Schema.optional(Schema.String)
  }),
  userBalance: Schema.Struct({
    balance: Schema.Int,
    currency: Schema.Literal("credits"),
    lastUpdated: Schema.Date
  })
})

export const PurchaseSettledError = Schema.Union(
  Schema.Struct({
    _tag: Schema.Literal("ProductUnavailable"),
    productCode: Schema.String,
    reason: Schema.Literal("not_found", "archived", "country_unavailable", "pricing_mismatch")
  }),
  Schema.Struct({
    _tag: Schema.Literal("DuplicateSettlement"),
    externalRef: Schema.String,
    existingLotId: Schema.String,
    existingReceiptId: Schema.String
  }),
  Schema.Struct({
    _tag: Schema.Literal("InvalidRequest"),
    field: Schema.String,
    message: Schema.String
  }),
  Schema.Struct({
    _tag: Schema.Literal("ServiceUnavailable"),
    retryAfter: Schema.String // "5s", "30s", etc.
  })
)

// Tagged Request Implementation
export class PurchaseSettled extends Request.TaggedRequest("PurchaseSettled")<
  PurchaseSettledError,
  PurchaseSettledSuccess
> {
  constructor(readonly input: typeof PurchaseSettledInput.Type) {
    super()
  }
}
```

### Operation Lifecycle Contracts

#### Operation.Open Schema
```typescript
// packages/rpc/src/schemas/OperationContracts.ts
export const OperationOpenInput = Schema.Struct({
  userId: Schema.String,
  operationTypeCode: Schema.String,
  workflowId: Schema.optional(Schema.String),
  timeoutMinutes: Schema.optional(Schema.Number) // Override merchant default
})

export const OperationOpenSuccess = Schema.Struct({
  operation: Schema.Struct({
    operationId: Schema.String,
    status: Schema.Literal("open"),
    capturedRate: Schema.Number, // Credits per unit at open time
    openedAt: Schema.Date,
    expiresAt: Schema.Date
  })
})

export const OperationOpenError = Schema.Union(
  Schema.Struct({
    _tag: Schema.Literal("OperationUnavailable"),
    reason: Schema.Literal("user_has_open_operation", "operation_type_archived", "service_disabled")
  }),
  Schema.Struct({
    _tag: Schema.Literal("InsufficientBalance"),
    currentBalance: Schema.Int,
    requiredBalance: Schema.Int
  }),
  Schema.Struct({
    _tag: Schema.Literal("InvalidRequest"),
    field: Schema.String,
    message: Schema.String
  })
)

export class OperationOpen extends Request.TaggedRequest("OperationOpen")<
  OperationOpenError,
  OperationOpenSuccess
> {
  constructor(readonly input: typeof OperationOpenInput.Type) {
    super()
  }
}
```

#### Operation.RecordAndClose Schema  
```typescript
export const OperationRecordAndCloseInput = Schema.Struct({
  operationId: Schema.String,
  resourceAmount: Schema.Number, // Unit comes from OperationType
  completedAt: Schema.Date,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
})

export const OperationRecordAndCloseSuccess = Schema.Struct({
  operation: Schema.Struct({
    operationId: Schema.String,
    status: Schema.Literal("completed"),
    finalCost: Schema.Int,
    completedAt: Schema.Date
  }),
  ledgerEntry: Schema.Struct({
    entryId: Schema.String,
    lotId: Schema.String,
    amount: Schema.Int, // Negative for debit
    createdAt: Schema.Date
  }),
  userBalance: Schema.Struct({
    balance: Schema.Int,
    currency: Schema.Literal("credits"),
    lastUpdated: Schema.Date
  })
})

export const OperationRecordAndCloseError = Schema.Union(
  Schema.Struct({
    _tag: Schema.Literal("OperationExpired"),
    operationId: Schema.String,
    expiredAt: Schema.Date
  }),
  Schema.Struct({
    _tag: Schema.Literal("OperationNotFound"),
    operationId: Schema.String
  }),
  Schema.Struct({
    _tag: Schema.Literal("InvalidRequest"),
    field: Schema.String,
    message: Schema.String
  })
)

export class OperationRecordAndClose extends Request.TaggedRequest("OperationRecordAndClose")<
  OperationRecordAndCloseError,
  OperationRecordAndCloseSuccess
> {
  constructor(readonly input: typeof OperationRecordAndCloseInput.Type) {
    super()
  }
}
```

Note: No Reservation Semantics
- Operation.Open captures the applicable rate and establishes an operation context only. It does not hold or reserve credits, and it does not alter the user's balance. Debiting occurs exclusively in Operation.RecordAndClose.

### Grant Application Contracts

#### Grant.Apply Schema
```typescript
// packages/rpc/src/schemas/GrantContracts.ts
export const GrantApplyInput = Schema.Struct({
  grantType: Schema.Union(
    Schema.Literal("welcome"),
    Schema.Literal("promotional"), 
    Schema.Literal("adjustment")
  ),
  userId: Schema.String,
  grantData: Schema.Union(
    // Welcome grant (automatic)
    Schema.Struct({
      type: Schema.Literal("welcome")
    }),
    // Promotional grant
    Schema.Struct({
      type: Schema.Literal("promotional"),
      promoCode: Schema.String,
      campaignId: Schema.optional(Schema.String)
    }),
    // Administrative adjustment
    Schema.Struct({
      type: Schema.Literal("adjustment"),
      creditAmount: Schema.Int,
      accessPeriodDays: Schema.Number,
      justification: Schema.String,
      adminActor: Schema.String
    })
  )
})

export const GrantApplySuccess = Schema.Struct({
  lot: Schema.Struct({
    lotId: Schema.String,
    creditsTotal: Schema.Int,
    expiresAt: Schema.Date,
    reason: Schema.String, // "welcome", "promo", "adjustment"
  }),
  userBalance: Schema.Struct({
    balance: Schema.Int,
    currency: Schema.Literal("credits"),
    lastUpdated: Schema.Date
  })
})

export const GrantApplyError = Schema.Union(
  Schema.Struct({
    _tag: Schema.Literal("DuplicateAdminAction"),
    grantType: Schema.String,
    existingLotId: Schema.String
  }),
  Schema.Struct({
    _tag: Schema.Literal("AuthorizationRequired"),
    requiredRole: Schema.String
  }),
  Schema.Struct({
    _tag: Schema.Literal("InvalidRequest"),
    field: Schema.String,
    message: Schema.String
  })
)

export class GrantApply extends Request.TaggedRequest("GrantApply")<
  GrantApplyError,
  GrantApplySuccess
> {
  constructor(readonly input: typeof GrantApplyInput.Type) {
    super()
  }
}
```

### Query Operation Contracts

#### Balance and Ledger Queries
```typescript
// packages/rpc/src/schemas/QueryContracts.ts
export const GetUserBalanceInput = Schema.Struct({
  userId: Schema.String
})

export const GetUserBalanceSuccess = Schema.Struct({
  balance: Schema.Int,
  currency: Schema.Literal("credits"),
  lastUpdated: Schema.Date,
  activeLots: Schema.Array(Schema.Struct({
    lotId: Schema.String,
    creditsRemaining: Schema.Int,
    expiresAt: Schema.Date,
    productCode: Schema.String,
    issuedAt: Schema.Date
  }))
})

export class GetUserBalance extends Request.TaggedRequest("GetUserBalance")<
  never, // Queries don't fail with business errors
  GetUserBalanceSuccess
> {
  constructor(readonly input: typeof GetUserBalanceInput.Type) {
    super()
  }
}

export const GetLedgerHistoryInput = Schema.Struct({
  userId: Schema.String,
  options: Schema.optional(Schema.Struct({
    fromDate: Schema.optional(Schema.Date),
    toDate: Schema.optional(Schema.Date),
    limit: Schema.optional(Schema.Number),
    offset: Schema.optional(Schema.Number),
    reason: Schema.optional(Schema.Union(
      Schema.Literal("purchase"),
      Schema.Literal("welcome"),
      Schema.Literal("promo"),
      Schema.Literal("adjustment"),
      Schema.Literal("debit"),
      Schema.Literal("expiry"),
      Schema.Literal("refund"),
      Schema.Literal("chargeback")
    ))
  }))
})

export const GetLedgerHistorySuccess = Schema.Struct({
  entries: Schema.Array(Schema.Struct({
    entryId: Schema.String,
    lotId: Schema.String,
    amount: Schema.Int,
    reason: Schema.String,
    operationType: Schema.String,
    resourceAmount: Schema.optional(Schema.Number),
    resourceUnit: Schema.optional(Schema.String),
    workflowId: Schema.optional(Schema.String),
    createdAt: Schema.Date
  })),
  pagination: Schema.Struct({
    total: Schema.Number,
    offset: Schema.Number,
    limit: Schema.Number,
    hasMore: Schema.Boolean
  })
})

export class GetLedgerHistory extends Request.TaggedRequest("GetLedgerHistory")<
  never,
  GetLedgerHistorySuccess
> {
  constructor(readonly input: typeof GetLedgerHistoryInput.Type) {
    super()
  }
}
```

#### Receipt Queries
```typescript
// packages/rpc/src/schemas/ReceiptQueryContracts.ts

export const GetReceiptByIdInput = Schema.Struct({
  receiptId: Schema.String
})

export const GetReceiptByIdSuccess = Schema.Struct({
  receipt: Schema.Struct({
    receiptId: Schema.String,
    receiptNumber: Schema.String,
    issuedAt: Schema.Date,
    userId: Schema.String,
    lotId: Schema.String,
    downloadUrl: Schema.optional(Schema.String)
  })
})

export const GetReceiptByIdError = Schema.Struct({
  _tag: Schema.Literal("ReceiptNotFound"),
  receiptId: Schema.String
})

export class GetReceiptById extends Request.TaggedRequest("GetReceiptById")<
  typeof GetReceiptByIdError.Type,
  typeof GetReceiptByIdSuccess.Type
> {
  constructor(readonly input: typeof GetReceiptByIdInput.Type) {
    super()
  }
}

export const ListReceiptsInput = Schema.Struct({
  userId: Schema.String,
  options: Schema.optional(Schema.Struct({
    fromDate: Schema.optional(Schema.Date),
    toDate: Schema.optional(Schema.Date),
    limit: Schema.optional(Schema.Number),
    offset: Schema.optional(Schema.Number)
  }))
})

export const ListReceiptsSuccess = Schema.Struct({
  receipts: Schema.Array(Schema.Struct({
    receiptId: Schema.String,
    receiptNumber: Schema.String,
    issuedAt: Schema.Date,
    lotId: Schema.String,
    downloadUrl: Schema.optional(Schema.String)
  })),
  pagination: Schema.Struct({
    total: Schema.Number,
    offset: Schema.Number,
    limit: Schema.Number,
    hasMore: Schema.Boolean
  })
})

export class ListReceipts extends Request.TaggedRequest("ListReceipts")<
  never,
  typeof ListReceiptsSuccess.Type
> {
  constructor(readonly input: typeof ListReceiptsInput.Type) {
    super()
  }
}
```

## JWT Authentication & Multi-Tenant Routing

### JWT Token Structure

Based on the authentication decisions in [brief.md](brief.md), the system uses permanent JWT tokens with embedded merchant context:

```typescript
// packages/shared/src/auth/JwtTypes.ts
export const JwtClaims = Schema.Struct({
  sub: Schema.String, // service-account-id
  merchant_id: Schema.String, // acme-corp
  aud: Schema.Literal("credit-ledger-api"),
  scope: Schema.String, // "ledger:read ledger:write"
  iat: Schema.Number,
  exp: Schema.Union(Schema.Number, Schema.Null) // null for permanent tokens
})

export type JwtClaims = typeof JwtClaims.Type
```

### Authentication Middleware Implementation

```typescript
// packages/shared/src/auth/AuthMiddleware.ts
import { Effect, Context } from "effect"
import { Request } from "@effect/rpc"
import * as jwt from "jsonwebtoken"

export class MerchantContext extends Context.Tag("MerchantContext")<
  MerchantContext,
  {
    merchantId: string
    scope: string[]
    serviceAccountId: string
  }
>() {}

export const JwtAuthMiddleware = <R, E, A>(
  handler: (request: Request.Request<E, A>) => Effect.Effect<A, E, R>
) => (request: Request.Request<E, A>) =>
  Effect.gen(function* (_) {
    const authHeader = yield* _(getAuthorizationHeader())
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      yield* _(Effect.fail(new AuthenticationRequiredError()))
    }
    
    const token = authHeader.substring(7) // Remove "Bearer "
    const jwtSecret = yield* _(Config.secret("JWT_SECRET"))
    
    // Verify and decode JWT
    const decoded = yield* _(
      Effect.tryPromise({
        try: () => jwt.verify(token, jwtSecret) as JwtClaims,
        catch: (error) => new InvalidJwtError(String(error))
      })
    )
    
    // Validate merchant_id and create context
    const merchantId = decoded.merchant_id
    if (!merchantId) {
      yield* _(Effect.fail(new MissingMerchantIdError()))
    }
    
    // Validate merchant exists (check database URL configuration)
    const merchantExists = yield* _(validateMerchantExists(merchantId))
    if (!merchantExists) {
      yield* _(Effect.fail(new InvalidMerchantError(merchantId)))
    }
    
    const merchantContext = {
      merchantId,
      scope: decoded.scope.split(' '),
      serviceAccountId: decoded.sub
    }
    
    // Execute handler with merchant context
    return yield* _(
      handler(request).pipe(
        Effect.provideService(MerchantContext, merchantContext)
      )
    )
  })

// Database routing based on merchant context
export const getDatabaseConnection = (merchantId: string) =>
  Effect.gen(function* (_) {
    const dbUrl = yield* _(
      Config.string(`MERCHANT_${merchantId.toUpperCase()}_DATABASE_URL`)
    )
    
    return yield* _(SqlClient.make({
      connectionString: dbUrl,
      pool: {
        min: 2,
        max: 10,
        acquireTimeoutMs: 5000
      }
    }))
  })
```

### Authentication Error Types

```typescript
// packages/rpc/src/errors/AuthErrors.ts
export const AuthenticationRequiredError = Schema.Struct({
  _tag: Schema.Literal("AuthenticationRequired"),
  message: Schema.Literal("Authorization header is required")
})

export const InvalidJwtError = Schema.Struct({
  _tag: Schema.Literal("InvalidJwt"),
  reason: Schema.String
})

export const MissingMerchantIdError = Schema.Struct({
  _tag: Schema.Literal("MissingMerchantId"),
  message: Schema.Literal("JWT must contain merchant_id claim")
})

export const InvalidMerchantError = Schema.Struct({
  _tag: Schema.Literal("InvalidMerchant"),
  merchantId: Schema.String
})

export const InsufficientScopeError = Schema.Struct({
  _tag: Schema.Literal("InsufficientScope"),
  requiredScope: Schema.String,
  actualScope: Schema.Array(Schema.String)
})

export type AuthError = 
  | typeof AuthenticationRequiredError.Type
  | typeof InvalidJwtError.Type
  | typeof MissingMerchantIdError.Type
  | typeof InvalidMerchantError.Type
  | typeof InsufficientScopeError.Type
```

### Versioning Error Types

```typescript
// packages/rpc/src/errors/VersioningErrors.ts
export const UnsupportedApiVersion = Schema.Struct({
  _tag: Schema.Literal("UnsupportedApiVersion"),
  requested: Schema.String,
  minSupported: Schema.String,
  latest: Schema.String
})
```

### RPC Server Implementation

```typescript
// apps/server/src/rpc/RpcServer.ts
import { Rpc, Router } from "@effect/rpc"
import { HttpRouter, HttpServerRequest } from "@effect/platform"

// Handler implementations
const purchaseSettledHandler = (request: PurchaseSettled) =>
  Effect.gen(function* (_) {
    const merchantContext = yield* _(MerchantContext)
    const dbClient = yield* _(getDatabaseConnection(merchantContext.merchantId))
    
    // Business logic implementation
    const result = yield* _(
      PurchaseSettlementService.settlePurchase(request.input).pipe(
        Effect.provideService(SqlClient.SqlClient, dbClient)
      )
    )
    
    return result
  })

const operationOpenHandler = (request: OperationOpen) =>
  Effect.gen(function* (_) {
    const merchantContext = yield* _(MerchantContext)
    const dbClient = yield* _(getDatabaseConnection(merchantContext.merchantId))
    
    const result = yield* _(
      OperationService.openOperation(request.input).pipe(
        Effect.provideService(SqlClient.SqlClient, dbClient)
      )
    )
    
    return result
  })

// RPC Router Configuration
// NOTE: System jobs (Operation.Cleanup, Lot.Expire) are NOT included here
// as they run via pg_cron background jobs, not RPC endpoints
const creditServiceRouter = Router.make(
  Rpc.effect(PurchaseSettled, purchaseSettledHandler),
  Rpc.effect(OperationOpen, operationOpenHandler),
  Rpc.effect(OperationRecordAndClose, operationRecordAndCloseHandler),
  Rpc.effect(GrantApply, grantApplyHandler),
  Rpc.effect(CreditAdjustmentApply, creditAdjustmentApplyHandler),
  Rpc.effect(RefundApply, refundApplyHandler),
  Rpc.effect(ChargebackApply, chargebackApplyHandler),
  Rpc.effect(GetUserBalance, getUserBalanceHandler),
  Rpc.effect(GetLedgerHistory, getLedgerHistoryHandler),
  Rpc.effect(GetReceiptById, getReceiptByIdHandler),
  Rpc.effect(ListReceipts, listReceiptsHandler)
  // TODO: Add admin command schemas during implementation:
  // - DebitAdjustment.Apply, Product.Create, Product.Archive, OperationType.CreateWithArchival
)

// HTTP Integration
const httpRouter = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/rpc",
    Effect.gen(function* (_) {
      const request = yield* _(HttpServerRequest.HttpServerRequest)
      
      return yield* _(
        Rpc.make(creditServiceRouter).pipe(
          JwtAuthMiddleware,
          Effect.provideService(HttpServerRequest.HttpServerRequest, request)
        )
      )
    })
  )
)
```

## Client Integration Patterns

### Type-Safe RPC Client Factory

```typescript
// packages/client/src/CreditClient.ts
import { Rpc } from "@effect/rpc"
import { Effect, Config } from "effect"

export interface CreditClientConfig {
  baseUrl: string
  jwt: string
  timeout?: number
  apiVersion?: string // YYYY-MM-DD
}

export const createCreditClient = (config: CreditClientConfig) =>
  Effect.gen(function* (_) {
    const defaultApiVersion = yield* _(Config.string("DEFAULT_API_VERSION"))
    const apiVersion = config.apiVersion ?? defaultApiVersion
    const client = yield* _(
      Rpc.make<typeof creditServiceRouter>({
        baseUrl: config.baseUrl,
        headers: {
          'Authorization': `Bearer ${config.jwt}`,
          'Content-Type': 'application/json',
          'X-API-Version': apiVersion
        },
        timeout: config.timeout ?? 30000
      })
    )
    
    return {
      // Purchase operations
      settlePurchase: (input: typeof PurchaseSettledInput.Type) =>
        client(new PurchaseSettled(input)),
        
      // Operation lifecycle
      openOperation: (input: typeof OperationOpenInput.Type) =>
        client(new OperationOpen(input)),
        
      recordAndCloseOperation: (input: typeof OperationRecordAndCloseInput.Type) =>
        client(new OperationRecordAndClose(input)),
        
      // Grant applications
      applyGrant: (input: typeof GrantApplyInput.Type) =>
        client(new GrantApply(input)),
      
      // Admin commands
      applyCreditAdjustment: (input: typeof CreditAdjustmentApplyInput.Type) =>
        client(new CreditAdjustmentApply(input)),
      applyRefund: (input: typeof RefundApplyInput.Type) =>
        client(new RefundApply(input)),
      applyChargeback: (input: typeof ChargebackApplyInput.Type) =>
        client(new ChargebackApply(input)),
        
      // Queries
      getUserBalance: (userId: string) =>
        client(new GetUserBalance({ userId })),
        
      getLedgerHistory: (input: typeof GetLedgerHistoryInput.Type) =>
        client(new GetLedgerHistory(input)),
      
      // Receipt queries
      getReceiptById: (receiptId: string) =>
        client(new GetReceiptById({ receiptId })),
      listReceipts: (input: typeof ListReceiptsInput.Type) =>
        client(new ListReceipts(input))
    }
  })
```

### Client Usage Examples

```typescript
// Example: Purchase settlement
const creditClient = yield* _(createCreditClient({
  baseUrl: "https://credit-api.railway.app",
  jwt: process.env.CREDIT_SERVICE_JWT
}))

const settlementResult = yield* _(
  creditClient.settlePurchase({
    userId: "user-123",
    productCode: "premium-plan",
    settlementData: {
      externalRef: "stripe_payment_intent_123",
      orderPlacedAt: new Date("2025-01-15T10:00:00Z"),
      settledAt: new Date("2025-01-15T10:01:00Z"),
      pricingSnapshot: {
        country: "US",
        currency: "USD",
        amount: 29.99
      }
    }
  }).pipe(
    Effect.catchTag("ProductUnavailable", (error) =>
      Effect.logError(`Product ${error.productCode} unavailable: ${error.reason}`)
    ),
    Effect.catchTag("DuplicateSettlement", (error) =>
      Effect.succeed({
        lot: { lotId: error.existingLotId },
        receipt: { receiptId: error.existingReceiptId }
      })
    )
  )
)

// Example: Operation execution  
const operationResult = yield* _(
  creditClient.openOperation({
    userId: "user-123",
    operationTypeCode: "api-call",
    workflowId: "workflow-456"
  }).pipe(
    Effect.flatMap(openResult =>
      // Perform external work
      doExternalWork().pipe(
        Effect.flatMap(workResult =>
          creditClient.recordAndCloseOperation({
            operationId: openResult.operation.operationId,
            resourceAmount: workResult.requestCount,
            completedAt: new Date()
          })
        )
      )
    ),
    Effect.catchTag("InsufficientBalance", (error) =>
      Effect.logWarn(`Insufficient balance: ${error.currentBalance} < ${error.requiredBalance}`)
    )
  )
)
```

### Error Handling Patterns

```typescript
// Comprehensive error handling example
const handleCreditOperation = <A>(
  operation: Effect.Effect<A, PurchaseSettledError | OperationOpenError | AuthError>
) =>
  operation.pipe(
    // Business errors
    Effect.catchTag("ProductUnavailable", (error) => 
      Effect.logError(`Product issue: ${error.reason}`) *>
      Effect.fail(new BusinessLogicError("Product unavailable"))
    ),
    Effect.catchTag("InsufficientBalance", (error) =>
      Effect.logWarn(`Balance ${error.currentBalance} insufficient`) *>
      Effect.fail(new UserActionRequiredError("Insufficient credits"))
    ),
    
    // Authentication errors
    Effect.catchTag("AuthenticationRequired", () =>
      Effect.logError("Missing authentication") *>
      Effect.fail(new ConfigurationError("JWT token required"))
    ),
    Effect.catchTag("InvalidMerchant", (error) =>
      Effect.logError(`Invalid merchant: ${error.merchantId}`) *>
      Effect.fail(new ConfigurationError("Merchant configuration invalid"))
    ),
    
    // System errors
    Effect.catchTag("ServiceUnavailable", (error) =>
      Effect.logWarn(`Service unavailable, retry after: ${error.retryAfter}`) *>
      Effect.sleep(parseRetryAfter(error.retryAfter)) *>
      Effect.fail(new RetryableError("Service temporarily unavailable"))
    )
  )

// Retry logic with exponential backoff
const withRetries = <A, E>(effect: Effect.Effect<A, E>) =>
  effect.pipe(
    Effect.retry(
      Schedule.exponential("100 millis").pipe(
        Schedule.intersect(Schedule.recurs(3)),
        Schedule.whileInput((error: E) => isRetryable(error))
      )
    )
  )
```

## Essential Figures

### Figure 4.1: RPC Request Flow

```mermaid
sequenceDiagram
    participant Client as Client Application
    participant Middleware as JWT Middleware
    participant Router as RPC Router  
    participant Handler as Business Handler
    participant DB as Merchant Database
    
    Client->>Middleware: HTTP Request + JWT
    
    Note over Middleware: JWT Validation Block
    Middleware->>Middleware: 1. Extract Bearer Token
    Middleware->>Middleware: 2. Verify JWT Signature
    Middleware->>Middleware: 3. Validate merchant_id
    Middleware->>Middleware: 4. Check Merchant Config
    
    alt JWT Valid
        Middleware->>Router: Request + Merchant Context
        Router->>Handler: Route to Business Logic
        
        Note over Handler,DB: Business Operation
        Handler->>DB: Query/Insert with Merchant DB
        DB-->>Handler: Result
        Handler->>Handler: Apply Business Rules
        
        Handler-->>Router: Business Result
        Router-->>Middleware: RPC Response
        Middleware-->>Client: HTTP 200 + Response
    else JWT Invalid
        Middleware-->>Client: HTTP 401 + Auth Error
    end
    
    Note over Client,DB: Type Safety Throughout
    
    style Middleware fill:#fff3e0
    style Handler fill:#e3f2fd
    style DB fill:#e8f5e8
```

### Figure 4.2: Authentication & Multi-Tenant Routing

```mermaid
flowchart TD
    subgraph "Client Layer"
        CLIENT[Client Application]
        JWT_TOKEN[JWT Token<br/>merchant_id: acme-corp]
    end
    
    subgraph "Authentication Gateway"
        AUTH_MW[JWT Middleware]
        VALIDATE{JWT Valid?}
        MERCHANT_CHECK{Merchant<br/>Exists?}
    end
    
    subgraph "Business Layer"
        RPC_ROUTER[RPC Router]
        HANDLER[Request Handler]
        MERCHANT_CTX[Merchant Context<br/>merchantId: acme-corp<br/>scope: [ledger:read, ledger:write]]
    end
    
    subgraph "Data Layer (Per Merchant)"
        DB_ACME[(ACME Database<br/>MERCHANT_ACME_DATABASE_URL)]
        DB_DEMO[(DEMO Database<br/>MERCHANT_DEMO_DATABASE_URL)]
        DB_OTHER[(Other Merchant DBs)]
    end
    
    CLIENT -->|HTTP + Bearer JWT| AUTH_MW
    JWT_TOKEN -.->|Embedded in Request| AUTH_MW
    
    AUTH_MW --> VALIDATE
    VALIDATE -->|Valid| MERCHANT_CHECK
    VALIDATE -->|Invalid| AUTH_ERROR[401 Auth Error]
    
    MERCHANT_CHECK -->|Exists| RPC_ROUTER
    MERCHANT_CHECK -->|Not Found| MERCHANT_ERROR[404 Merchant Error]
    
    RPC_ROUTER --> HANDLER
    HANDLER --> MERCHANT_CTX
    
    MERCHANT_CTX -->|acme-corp| DB_ACME
    MERCHANT_CTX -->|demo| DB_DEMO  
    MERCHANT_CTX -->|other-id| DB_OTHER
    
    DB_ACME --> RESULT[Business Result]
    DB_DEMO --> RESULT
    DB_OTHER --> RESULT
    
    RESULT --> CLIENT
    
    style AUTH_MW fill:#fff3e0
    style MERCHANT_CTX fill:#e3f2fd
    style DB_ACME fill:#e8f5e8
    style DB_DEMO fill:#e8f5e8
    style DB_OTHER fill:#e8f5e8
```

**Authentication & Routing Principles:**
- **JWT-Based Context**: merchant_id claim determines database routing
- **Permanent Tokens**: Service-to-service communication uses long-lived JWTs
- **Complete Isolation**: Each merchant routes to separate database
- **Type-Safe Validation**: Effect Schema validates all claims and routing parameters
- **Scope-Based Authorization**: JWT scopes control operation permissions per merchant

## Implementation Notes

### API Design Principles
- **Contract-First**: Pure Effect Schema definitions enable client/server decoupling
- **Type Safety**: Complete type safety from client request through database operations
- **Error Transparency**: Tagged errors provide clear client guidance and recovery paths
- **Merchant Isolation**: Authentication automatically scopes all operations to merchant context

### Client Integration Best Practices
- **Retry Logic**: Implement exponential backoff for transient failures
- **Error Categorization**: Handle business errors differently from system errors
- **Idempotency Keys**: Always set a unique `Idempotency-Key` for every write command; reuse the same key on safe retries only.
- **JWT Management**: Store JWT securely and validate expiration (if applicable)
- **Connection Pooling**: Reuse client instances across operations for performance

### Security Considerations
- **Network Security**: Assume private network deployment (Railway services)
- **Token Scope**: Validate JWT scope matches required operation permissions
- **Merchant Validation**: Always verify merchant_id maps to valid configuration
- **Request Validation**: Schema validation prevents injection and malformed data

This API contract specification provides complete type-safe integration patterns for upstream applications while maintaining the multi-tenant security boundaries and lean system architecture established in the technical brief.
