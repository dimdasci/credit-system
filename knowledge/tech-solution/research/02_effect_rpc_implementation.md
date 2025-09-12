# Effect RPC Implementation Guide

## 1. Define RPC Requests (packages/rpc)

```typescript
// packages/rpc/src/requests/Purchase.ts
import { Schema as S } from "effect"

export class PurchaseSettled extends S.TaggedRequest<PurchaseSettled>()(
  "PurchaseSettled",
  {
    payload: {
      user_id: S.String,
      product_code: S.String,
      pricing_snapshot: S.Struct({
        country: S.String,
        currency: S.String,
        amount: S.Number,
      }),
      external_ref: S.String,
      idempotency_key: S.String,
    },
    success: S.Struct({
      lot_id: S.String,
      receipt_id: S.String,
      credits_issued: S.Number,
    }),
    failure: S.Union(
      S.TaggedError("InsufficientBalance", { current: S.Number }),
      S.TaggedError("ProductNotFound", { product_code: S.String }),
      S.TaggedError("DuplicateSettlement", { external_ref: S.String })
    ),
  }
) {}
```

## 2. Server Handler Implementation (apps/server)

```typescript
// apps/server/src/handlers/PurchaseHandler.ts
import { Rpc, RpcRouter } from "@effect/rpc"
import { Effect } from "effect"

export const purchaseRouter = RpcRouter.make(
  Rpc.effect(PurchaseSettled, ({ payload }) =>
    PurchaseService.pipe(
      Effect.andThen((service) => service.settlePurchase(payload))
    )
  )
)

// apps/server/src/main.ts
import { HttpServer } from "@effect/platform"

const handler = RpcHandler.handle(purchaseRouter)

const HttpLive = HttpServer.serve(handler).pipe(
  Layer.provide(PurchaseService.Live),
  Layer.provide(NodeHttpServer.layer({ port: 3000 }))
)
```

## 3. Client Setup (packages/client)

```typescript
// packages/client/src/client.ts
import { RpcClient } from "@effect/rpc"

export const createCreditClient = (baseUrl: string, jwt: string) =>
  RpcClient.make(
    HttpResolver.make({
      url: baseUrl,
      headers: { Authorization: `Bearer ${jwt}` }
    })
  )

// Usage
const client = createCreditClient("https://api.example.com", jwt)
const result = await client(new PurchaseSettled({ payload }))
  .pipe(Effect.runPromise)
```

## 4. Authentication Middleware

```typescript
// apps/server/src/middleware/AuthMiddleware.ts
export const JwtMiddleware = HttpMiddleware.make((app) =>
  Effect.gen(function* (_) {
    const request = yield* _(HttpServerRequest.HttpServerRequest)
    const token = extractJwtFromHeader(request)
    const merchantId = yield* _(validateJwtAndExtractMerchantId(token))
    
    return yield* _(
      app,
      Effect.provideService(MerchantContext, { merchantId })
    )
  })
)
```

## 5. Error Handling Pattern

```typescript
// Automatic error propagation
export class PurchaseService extends Effect.Service<PurchaseService>() {
  settlePurchase = (input: PurchaseInput) =>
    Effect.gen(function* (_) {
      // Business logic that can fail with typed errors
      const product = yield* _(findProduct(input.product_code))
        .pipe(Effect.orElseFail(() => new ProductNotFound({ product_code })))
      
      const lot = yield* _(createCreditLot(product, input))
      const receipt = yield* _(generateReceipt(lot, input))
      
      return { lot_id: lot.id, receipt_id: receipt.id, credits_issued: lot.credits }
    })
}
```

## 6. Required Dependencies

```json
{
  "dependencies": {
    "@effect/rpc": "latest",
    "@effect/rpc-http": "latest", 
    "effect": "latest"
  }
}
```

## Key Patterns

- **Schema-first**: Define requests with typed payloads, success, and failure cases
- **Tagged errors**: Use `S.TaggedError` for type-safe error handling
- **Effect composition**: Chain operations with `Effect.andThen` and `Effect.gen`
- **Service injection**: Use Effect's dependency injection for clean architecture