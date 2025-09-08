# Platform Logging Strategy for Credit System

This document outlines the logging strategy for the Credit System, based on Effect platform patterns and our implementation findings.

## Table of Contents

- [Overview](#overview)
- [Logging Architecture](#logging-architecture)
- [Implementation Patterns](#implementation-patterns)
- [Request Correlation](#request-correlation)
- [API Group Strategy](#api-group-strategy)
- [Complete Implementation](#complete-implementation)
- [Best Practices](#best-practices)

## Overview

The Credit System uses a **hybrid logging approach** that combines Effect platform's built-in HTTP logging with custom business-level structured logging. This strategy provides comprehensive observability while maintaining clean separation between infrastructure and business concerns.

### Key Principles

1. **Built-in logger** handles HTTP infrastructure logging (requests, responses, timing, errors)
2. **Custom middleware** provides business-level structured logging with request correlation
3. **Strategic application** - logging middleware only where business value exists
4. **Structured annotations** ensure consistent metadata across all business logs

## Logging Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ HTTP Infrastructure Layer                                   │
│ HttpMiddleware.logger                                       │
│ - Request/Response lifecycle                                │
│ - HTTP status codes, timing                                 │
│ - Network errors                                            │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│ Business Logic Layer                                        │
│ CreditLedgerLogger (Custom Middleware)                      │
│ - Business operations context                               │
│ - Request correlation (requestId, userId)                   │
│ - Domain-specific metadata                                  │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│ Application Handler Layer                                   │
│ Effect.logInfo/logError in handlers                         │
│ - Operation-specific details                                │
│ - Business state changes                                    │
│ - Error context                                             │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Patterns

### 1. Built-in HTTP Middleware

Applied at the server level for automatic HTTP lifecycle logging:

```typescript
import { HttpApiBuilder, HttpMiddleware } from "@effect/platform"

const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(HttpApiBuilder.middlewareCors()),
  Layer.provide(MyApiLive),
  HttpServer.withLogAddress,
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
)
```

**Provides:**
- HTTP method, URL, status code
- Request duration timing
- Network-level error handling
- Automatic span tracking

### 2. Custom Business Middleware

Applied selectively to business API groups:

```typescript
import { HttpApiMiddleware, HttpServerRequest } from "@effect/platform"
import { Effect, Layer, Schema } from "effect"

// Define the middleware tag
export class CreditLedgerLogger extends HttpApiMiddleware.Tag<CreditLedgerLogger>()(
  "CreditLedger/Logger"
) {}

// Implement with structured annotations
const CreditLedgerLoggerLive = Layer.effect(
  CreditLedgerLogger,
  Effect.gen(function*() {
    return Effect.gen(function*() {
      const request = yield* HttpServerRequest.HttpServerRequest
      
      const annotations = {
        requestId: request.headers["x-request-id"] || crypto.randomUUID(),
        userId: request.headers["x-user-id"] || "anonymous",
        service: "credit-ledger",
        operation: extractOperationFromUrl(request.url)
      }
      
      // All subsequent logs inherit these annotations
      return Effect.annotateLogs(
        Effect.logInfo("Processing credit operation", {
          endpoint: request.url,
          method: request.method
        }),
        annotations
      )
    })
  })
)
```

## Request Correlation

The key to effective logging is **request correlation** using `Effect.annotateLogs`. This ensures all logs within a request context share common identifiers.

### Automatic Annotation Inheritance

```typescript
// In middleware - sets annotations for entire request context
return Effect.annotateLogs(
  Effect.logInfo("Processing credit operation"),
  {
    requestId: "abc-123",
    userId: "user-456",
    service: "credit-ledger"
  }
)

// In handlers - automatically inherits annotations
const creditHandlers = handlers.handle("debitCredits", ({ payload }) =>
  Effect.gen(function*() {
    // This log automatically includes requestId, userId, service
    yield* Effect.logInfo("Debiting credits", { 
      amount: payload.amount,
      accountId: payload.accountId
    })
    
    const result = yield* CreditService.debit(payload)
    
    // This too
    yield* Effect.logInfo("Credits debited successfully", { 
      newBalance: result.balance,
      transactionId: result.transactionId
    })
    
    return result
  })
)
```

### Log Output Example

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "message": "Credits debited successfully",
  "requestId": "abc-123",
  "userId": "user-456", 
  "service": "credit-ledger",
  "operation": "debit-credits",
  "newBalance": 150,
  "transactionId": "tx-789"
}
```

## API Group Strategy

**Strategic separation** of API groups based on logging needs:

```typescript
// System endpoints - no business logging needed
const SystemApiGroup = HttpApiGroup.make("system")
  .add(healthEndpoint)
  .add(versionEndpoint)
  // Only HttpMiddleware.logger applies

// Business endpoints - full structured logging
const CreditApiGroup = HttpApiGroup.make("credits")
  .add(createTransactionEndpoint)
  .add(getCreditBalanceEndpoint)
  .add(debitCreditsEndpoint)
  .middleware(CreditLedgerLogger) // Business logging middleware

const API = HttpApi.make("credit-ledger-api")
  .add(SystemApiGroup)
  .add(CreditApiGroup)
```

### Benefits

1. **Performance** - Health checks don't pay middleware cost
2. **Log clarity** - Infrastructure vs business logs are separated
3. **Debugging efficiency** - Easy filtering by concern level
4. **Maintenance** - Clear boundaries between system and business logging

## Complete Implementation

### Middleware Definition

```typescript
// src/api/middleware/logging.ts
import { HttpApiMiddleware, HttpServerRequest } from "@effect/platform"
import { Effect, Layer } from "effect"

export class CreditLedgerLogger extends HttpApiMiddleware.Tag<CreditLedgerLogger>()(
  "CreditLedger/Logger"
) {}

const extractOperationFromUrl = (url: string): string => {
  const segments = url.split('/').filter(Boolean)
  return segments.slice(-1)[0] || 'unknown'
}

export const CreditLedgerLoggerLive = Layer.effect(
  CreditLedgerLogger,
  Effect.gen(function*() {
    yield* Effect.logInfo("Creating CreditLedger logging middleware")
    
    return Effect.gen(function*() {
      const request = yield* HttpServerRequest.HttpServerRequest
      
      const annotations = {
        requestId: request.headers["x-request-id"] || crypto.randomUUID(),
        userId: request.headers["x-user-id"] || "anonymous",
        service: "credit-ledger",
        operation: extractOperationFromUrl(request.url),
        timestamp: new Date().toISOString()
      }
      
      return Effect.annotateLogs(
        Effect.logInfo("Processing credit operation", {
          endpoint: request.url,
          method: request.method,
          userAgent: request.headers["user-agent"] || "unknown"
        }),
        annotations
      )
    })
  })
)
```

### API Structure

```typescript
// src/api/api.ts
import { HttpApi, HttpApiGroup } from "@effect/platform"
import { CreditLedgerLogger } from "./middleware/logging"
import { healthEndpoint, versionEndpoint } from "./endpoints/system"
import { creditEndpoints } from "./endpoints/credits"

// System endpoints - minimal logging
const SystemApiGroup = HttpApiGroup.make("system")
  .add(healthEndpoint)
  .add(versionEndpoint)

// Business endpoints - full structured logging  
const CreditApiGroup = HttpApiGroup.make("credits")
  .add(...creditEndpoints)
  .middleware(CreditLedgerLogger)

export const API = HttpApi.make("credit-ledger-api")
  .add(SystemApiGroup)
  .add(CreditApiGroup)
```

### Handler Implementation

```typescript
// src/api/handlers/credits.ts
import { Effect } from "effect"
import { CreditService } from "../../services/CreditService"

export const creditHandlers = HttpApiBuilder.group(API, "credits", (handlers) =>
  Effect.gen(function*() {
    const creditService = yield* CreditService
    
    return handlers
      .handle("debitCredits", ({ payload }) =>
        Effect.gen(function*() {
          yield* Effect.logInfo("Starting debit operation", {
            amount: payload.amount,
            accountId: payload.accountId,
            reason: payload.reason
          })
          
          try {
            const result = yield* creditService.debit(payload)
            
            yield* Effect.logInfo("Debit completed successfully", {
              transactionId: result.transactionId,
              previousBalance: result.previousBalance,
              newBalance: result.newBalance,
              amountDebited: payload.amount
            })
            
            return result
          } catch (error) {
            yield* Effect.logError("Debit operation failed", {
              error: error.message,
              accountId: payload.accountId,
              attemptedAmount: payload.amount
            })
            
            throw error
          }
        })
      )
      .handle("getCreditBalance", ({ path }) =>
        Effect.gen(function*() {
          yield* Effect.logInfo("Retrieving credit balance", {
            accountId: path.accountId
          })
          
          const balance = yield* creditService.getBalance(path.accountId)
          
          yield* Effect.logInfo("Balance retrieved", {
            accountId: path.accountId,
            balance: balance.current,
            lastUpdated: balance.lastUpdated
          })
          
          return balance
        })
      )
  })
).pipe(
  Layer.provide(CreditLedgerLoggerLive)
)
```

## Best Practices

### 1. Consistent Metadata Structure

Always include these base annotations in business middleware:
- `requestId` - For request correlation
- `userId` - For user tracking
- `service` - For multi-service environments
- `operation` - For operation-specific filtering

### 2. Structured Log Messages

Use consistent patterns for log messages:

```typescript
// Good: Structured with context
yield* Effect.logInfo("Operation completed", {
  operation: "debit",
  accountId: "acc-123",
  amount: 50,
  newBalance: 100
})

// Avoid: Unstructured strings
yield* Effect.logInfo(`Debited ${amount} from account ${accountId}`)
```

### 3. Error Context

Provide rich context in error logs:

```typescript
catch (error) {
  yield* Effect.logError("Credit operation failed", {
    error: error.message,
    errorCode: error.code,
    accountId: payload.accountId,
    operation: "debit",
    context: {
      requestedAmount: payload.amount,
      availableBalance: currentBalance,
      timestamp: new Date().toISOString()
    }
  })
  
  throw error
}
```

### 4. Performance Considerations

- Apply business middleware only to business endpoints
- Use lazy evaluation for expensive log data
- Consider log levels (INFO for operations, DEBUG for detailed state)

### 5. Development vs Production

Use Effect's built-in log level filtering:

```typescript
// Development - verbose logging
const devLogger = Logger.make(({ message }) => 
  console.log(JSON.stringify(message, null, 2))
)

// Production - structured JSON
const prodLogger = Logger.json
```

## Related Documentation

- [Effect Platform HTTP API](./09_effect_platform.md) - Core HTTP API patterns
- [Effect Logging Middleware](./08_effect_logging_middleware.md) - Middleware implementation details
- [Effect Logging Documentation](https://effect.website/docs/observability/logging/) - Official Effect logging guide

This logging strategy provides comprehensive observability while maintaining performance and clean separation of concerns in the Credit System implementation.