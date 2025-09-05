# PostgreSQL Multi-Tenant Connection Patterns

## 1. Database Connection Manager

```typescript
// packages/shared/src/infrastructure/DatabaseManager.ts
import { Pool } from 'pg'

export class DatabaseManager {
  private pools = new Map<string, Pool>()
  
  getConnection(merchantId: string): Pool {
    if (!this.pools.has(merchantId)) {
      const connectionString = this.getConnectionString(merchantId)
      const pool = new Pool({
        connectionString,
        max: 20, // Connection pool size per merchant
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000
      })
      this.pools.set(merchantId, pool)
    }
    return this.pools.get(merchantId)!
  }
  
  private getConnectionString(merchantId: string): string {
    const upperMerchantId = merchantId.toUpperCase()
    const connectionString = process.env[`MERCHANT_${upperMerchantId}_DATABASE_URL`]
    
    if (!connectionString) {
      throw new Error(`Database URL not configured for merchant: ${merchantId}`)
    }
    
    return connectionString
  }
}
```

## 2. JWT Authentication (Self-Signed)

```typescript
// packages/shared/src/auth/JwtService.ts
import jwt from 'jsonwebtoken'

interface MerchantToken {
  merchant_id: string
  scope: string
  iat: number
}

export class JwtService {
  private readonly secret = process.env.JWT_SECRET!
  
  createMerchantToken(merchantId: string): string {
    return jwt.sign(
      {
        merchant_id: merchantId,
        scope: 'ledger:read ledger:write'
      },
      this.secret,
      { 
        expiresIn: '365d', // Long-lived service tokens
        issuer: 'credit-ledger-service'
      }
    )
  }
  
  validateToken(token: string): MerchantToken {
    return jwt.verify(token, this.secret) as MerchantToken
  }
}
```

## 3. Effect Integration

```typescript
// packages/shared/src/services/DatabaseService.ts
import { Effect, Context, Layer } from 'effect'
import { Pool } from 'pg'

export class DatabaseContext extends Context.Tag('DatabaseContext')<
  DatabaseContext,
  { merchantId: string; pool: Pool }
>() {}

export const DatabaseService = Effect.Service<DatabaseService>({
  query: (sql: string, params?: any[]) =>
    Effect.gen(function* (_) {
      const { pool } = yield* _(DatabaseContext)
      const client = yield* _(Effect.tryPromise(() => pool.connect()))
      
      try {
        const result = yield* _(Effect.tryPromise(() => 
          client.query(sql, params)
        ))
        return result.rows
      } finally {
        client.release()
      }
    })
})
```

## 4. JWT Middleware

```typescript
// apps/server/src/middleware/AuthMiddleware.ts
export const AuthMiddleware = HttpMiddleware.make((app) =>
  Effect.gen(function* (_) {
    const request = yield* _(HttpServerRequest.HttpServerRequest)
    const authHeader = request.headers.authorization
    
    if (!authHeader?.startsWith('Bearer ')) {
      return yield* _(Effect.fail(new UnauthorizedError()))
    }
    
    const token = authHeader.replace('Bearer ', '')
    const jwtService = yield* _(JwtService)
    const payload = yield* _(
      Effect.tryPromise(() => jwtService.validateToken(token))
        .pipe(Effect.orElseFail(() => new InvalidTokenError()))
    )
    
    const dbManager = yield* _(DatabaseManager)
    const pool = dbManager.getConnection(payload.merchant_id)
    
    return yield* _(
      app,
      Effect.provideService(DatabaseContext, {
        merchantId: payload.merchant_id,
        pool
      })
    )
  })
)
```

## 5. Environment Variables

```bash
# JWT Secret
JWT_SECRET=your-secret-key-for-signing-tokens

# Per-merchant database connections
MERCHANT_ACME_DATABASE_URL=postgresql://user:pass@acme-db.example.com:5432/acme
MERCHANT_DEMO_DATABASE_URL=postgresql://user:pass@demo-db.example.com:5432/demo

# Can work with any PostgreSQL provider
MERCHANT_PROD_DATABASE_URL=postgresql://user:pass@prod.amazonaws.com:5432/postgres
```

## 6. CLI Merchant Administration (via RPC)

```typescript
// apps/cli/src/commands/create-merchant.ts (calls server RPC, no direct DB access)
import { Effect } from 'effect'
import { RpcClient } from '@effect/rpc'
import { HttpResolver } from '@effect/rpc-http'
import { AdminCreateMerchant } from '@credit/rpc/admin' // request schema

const makeClient = (baseUrl: string, adminJwt: string) =>
  RpcClient.make(
    HttpResolver.make({ url: baseUrl, headers: { Authorization: `Bearer ${adminJwt}` } })
  )

export const createMerchantCommand = (baseUrl: string, adminJwt: string, merchantId: string) =>
  Effect.gen(function* () {
    const client = makeClient(baseUrl, adminJwt)
    const result = yield* client(new AdminCreateMerchant({ merchant_id: merchantId }))
    console.log('Merchant created:', result)
  })
```

Notes:
- The CLI authenticates as a superadmin and invokes admin/control RPCs exposed by the server.
- The server performs DB validation and provisioning; the CLI does not talk to Postgres directly.

## 7. Connection Pool Benefits

- **Per-merchant isolation**: Separate connection pools prevent cross-tenant data leaks
- **Resource management**: Configurable pool sizes per merchant load
- **Connection reuse**: Efficient connection pooling reduces overhead
- **Provider agnostic**: Works with any managed Postgres (AWS RDS, Google Cloud SQL, etc.)

## Key Advantages

- **Database Provider Independent**: Not tied to provider-specific APIs
- **Custom JWT Control**: Full control over token lifecycle and claims
- **Simple Architecture**: Direct PostgreSQL connections without extra abstraction layers  
- **Cost Effective**: Pay only for database usage, not API calls
- **Performance**: Direct connection pooling without REST API overhead
