# Tech Solution Brief

The document provided essential information for technical solution design and implementation for the credit management service.

## Architecture Decision

**Confirmed Approach: Simple Append-Only Ledger**

Based on domain requirements analysis, the system architecture is clearly defined:

- **Core Structure**: Single `ledger_entries` table with all credit movements
- **Immutability**: Enforced at database level, corrections via compensating entries only
- **Balance Calculation**: `SUM(amount)` from all ledger entries
- **Multi-tenant Isolation**: Separate Supabase project per merchant (complete data isolation)
- **Audit Trail**: Every entry includes complete operation context (operation_type, resource_amount, resource_unit, workflow_id)

The domain requirements explicitly describe an append-only ledger system, aligning with the "lean focused system" design philosophy that prioritizes simplicity over complexity.

## Technology Stack and 3rd Party Services

- Target language: TypeScript
- Target framework: Effect

- Hosting platform: Railways. Upstream application backend is already deployed there.
- Database: PostgreSQL within Supabase service
- End-user Authentication: Supabase Auth
- Telemetry, Logging: Sentry 

## Tactical Implementation Questions

### 1. API Protocol Design ✅

**Decision: Effect/rpc + Effect Schema + JWT Authentication**

**Rationale:**
- **Zero Impedance Mismatch**: Full Effect ecosystem alignment eliminates translation layers
- **Native Error Propagation**: Effect's tagged errors flow naturally from server to client
- **Contract-First Design**: Pure schema contracts enable clean separation of concerns
- **Transport Evolution**: HTTP today, extensible to WebSocket/other transports later
- **Financial Precision**: Effect's type system and error handling ideal for financial operations
- **Targeting Effect Clients**: Upstream applications are Effect-based, making this the natural choice

**Implementation:**
- **Protocol**: Effect/rpc with Effect Schema contracts
- **Authentication**: JWT tokens with embedded merchant context
- **Versioning**: Date-based versioning following Stripe's model (e.g., "2025-01-15")
- **Error Handling**: Native Effect tagged errors (InsufficientBalance | OperationExpired | ValidationError)
- **Observability**: OpenTelemetry integration for audit compliance

**Monorepo Structure:**
```
credit-system/
├── package.json                 - Root workspace configuration
├── apps/
│   ├── server/                 - Railway deployable HTTP server
│   │   ├── package.json
│   │   └── src/
│   └── cli/                    - Administrative CLI tool (not deployed)
│       ├── package.json
│       └── src/
└── packages/
    ├── rpc/                    - Pure contracts (schemas + request tags)
    ├── client/                 - Typed RPC client factory + schema re-exports
    └── shared/                 - Common utilities, domain logic
```

**Railway Deployment Configuration:**
- **Service**: Single Railway service deploying `apps/server/`
- **Start Command**: `npm run start:server`
- **Watch Paths**: `apps/server/**, packages/rpc/**, packages/client/**, packages/shared/**`
- **Build Strategy**: Railway builds entire monorepo, runs server from `apps/server/`
- **CLI Distribution**: CLI lives in monorepo but deploys separately (local operator use or CI/CD)

**Service Interface Pattern:**
```typescript
// Purchase settlement request (in rpc package)
class PurchaseSettled extends Request.TaggedRequest("PurchaseSettled")<
  PurchaseSettledError,
  PurchaseSettledSuccess
> {
  constructor(readonly input: PurchaseSettledInput) { super() }
}

// Server handler (in server package)
Effect.provideService(
  Rpc.make(router),
  PurchaseSettledHandler,
  ({ input }) => purchaseSettledUseCase(input)
)
```

**Authentication Flow:**
1. Upstream app gets JWT with merchant_id claim
2. Effect/rpc middleware validates token and extracts merchant context
3. Automatic Supabase project routing based on merchant_id
4. All operations scoped to merchant boundary



**Reference Sources:**
- [Effect/rpc](https://effect-ts.github.io/effect/docs/rpc)
- [tRPC Authorization Documentation](https://trpc.io/docs/server/authorization)
- [API Key vs JWT: Secure B2B SaaS Authentication](https://www.scalekit.com/blog/apikey-jwt-comparison)
- [How I Replaced tRPC with Effect RPC Part I](https://dev.to/titouancreach/how-i-replaced-trpc-with-effect-rpc-in-a-nextjs-app-router-application-4j8p) and [Part II](https://dev.to/titouancreach/part-2-how-i-replaced-trpc-with-effect-rpc-in-a-nextjs-app-router-application-streaming-responses-566c)
- [Building Robust TypeScript APIs with Effect](https://dev.to/martinpersson/building-robust-typescript-apis-with-the-effect-ecosystem-1m7c)
- [Stripe's API Versioning Strategy](https://stripe.com/blog/api-versioning)
- [Railway gRPC Support Limitations](https://station.railway.com/questions/how-to-support-both-grpc-and-http-for-a-5dbb7109)

### 2. Idempotency Implementation ✅

**Decision: Priority-Based Idempotency Strategy**

The domain requirements specify different idempotency guarantees based on operation criticality, leading to two distinct technical approaches:

**Priority 1 - Production-Critical Operations** (Purchase.Settled, Operation.Open/RecordAndClose, Grant.Apply(welcome)):
- **Requirement**: "Return the same final outcome" - must materialize results
- **Approach**: Result Storage + Database Constraints
- **Implementation**: Store complete operation results (credit lots, receipts, operation outcomes)
- **Behavior**: On duplicate request, return stored result instead of rejection
- **Rationale**: Customer-facing operations require result consistency and replay capability

**Priority 2 - Administrative Operations** (Manual grants, adjustments, product management, refunds, chargebacks):
- **Requirement**: "Detect and reject duplicates" - simple prevention sufficient  
- **Approach**: Pure Database Constraints
- **Implementation**: Leverage natural business entity uniqueness constraints
- **Behavior**: On duplicate request, return clear error message for operator retry
- **Rationale**: Human operators can re-query if needed; no result materialization required

**Technical Strategy**:
- Use PostgreSQL unique constraints for atomicity and race condition prevention
- Implement result materialization only where business domain requires it
- 7-day cleanup window applies to both priority levels
- Merchant-scoped isolation through separate Supabase databases

**Idempotency Key Management**:
- **Client Keys**: Collision-resistant UUIDv7/ULID from clients for natural time-ordering
- **Transaction IDs**: Deterministic UUIDv5 of `{merchant_id}:{command_type}:{idempotency_key}` for consistent internal mapping
- **Concurrency Safety**: Four-state lifecycle management per idempotency key:
  - `PENDING`: Request accepted, processing in progress - prevents duplicate work
  - `SUCCEEDED`: Operation completed successfully - return stored result on retry
  - `FAILED_RETRIABLE`: Temporary failure (DB timeout, network) - allow retry with same key
  - `FAILED_FINAL`: Permanent failure (validation error, insufficient balance) - prevent retry loops

**Implementation Pattern**:
```typescript
// Deterministic transaction ID generation
const transactionId = uuidv5(`${merchantId}:${commandType}:${idempotencyKey}`, namespace);

// State-based idempotency handling
const existing = await getIdempotencyRecord(transactionId);
if (existing?.status === 'SUCCEEDED') return existing.result;
if (existing?.status === 'FAILED_FINAL') throw existing.error;
if (existing?.status === 'PENDING') return { status: 'in_progress', retry_after: '5s' };

// Lock and process
await setIdempotencyStatus(transactionId, 'PENDING');
try {
  const result = await processOperation(input);
  await setIdempotencyResult(transactionId, 'SUCCEEDED', result);
  return result;
} catch (error) {
  const status = isRetriable(error) ? 'FAILED_RETRIABLE' : 'FAILED_FINAL';
  await setIdempotencyResult(transactionId, status, error);
  throw error;
}
```

**Alignment**: This approach follows the lean system philosophy by using minimum complexity required for each operation type rather than over-engineering a one-size-fits-all solution.

### 3. Control App Interface ✅

**Decision: CLI Tool Approach**

**Rationale:**
- Balances simplicity with safety guardrails (validation, structured commands)
- Environment variable management for credentials (Railway-friendly)
- Complete service API implementation enables future client improvements
- Fits single superadmin operational model
- Scriptable and automation-friendly
- Minimal additional infrastructure

**Implementation Approach:**
```bash
# Example CLI commands
credit-cli grant apply --merchant=acme --user=user123 --credits=100 --reason="welcome"
credit-cli product create --merchant=acme --code=premium --credits=500 --price=29.99
credit-cli adjustment apply --merchant=acme --user=user123 --amount=50 --reason="service_credit"
```

**Technical Strategy:**
- **Authentication**: Environment variables for service credentials (API keys/JWT)
- **Command Structure**: Verb-noun pattern with merchant scoping
- **Validation**: Effect Schema validation for all command parameters
- **Audit Trail**: All CLI operations logged with actor context and timestamps
- **Error Handling**: Structured error messages with clear guidance for operators
- **Future Evolution**: CLI calls same service API that can support web UI later

**Benefits:**
- Environment variable credential management (Railway-native)
- Service API completeness enables future client development
- Operator-friendly with clear command structure
- Scriptable for automation scenarios
- Minimal complexity while maintaining safety

### 4. Operation Lifecycle Management ✅

**Decision: Database-Based Timeout with Status Management**

**Core Principle**: Never delete financial records, only transition states to preserve complete audit trail.

**Operation State Machine**:
- `open` → `completed` (via Operation.RecordAndClose)
- `open` → `expired` (via background cleanup job)  
- `open` → `cancelled` (optional, for manual admin intervention)

**Background Job Implementation**:
```sql
-- Safe cleanup: mark as expired, never delete
UPDATE operations 
SET status = 'expired', expired_at = NOW() 
WHERE status = 'open' AND expires_at < NOW();
```

**Safety Guarantees**:
- **Audit Trail Preservation**: All operation records retained forever for regulatory compliance
- **Double Execution Prevention**: Expired operations rejected by Operation.RecordAndClose
- **Rate Capture Integrity**: Original operation context preserved for investigation
- **Clear Error Messaging**: Clients receive specific "operation expired" responses

**Multi-Tenant Implementation**:
- Background job runs per Supabase project (merchant isolation)
- Merchant-configurable timeout settings (default: 15 minutes)
- Independent cleanup scheduling per merchant

**Validation Rules**:
- Operation.RecordAndClose only accepts `status = 'open'` operations
- Expired operations return structured error with operation details
- Idempotency checking respects operation status

**Rationale**: This approach prevents the disaster scenarios of record deletion while maintaining lean system complexity through simple state transitions.

### 5. Multi-tenant Database Connection Strategy ✅

**Decision: JWT-Based Merchant Resolution with Individual Environment Variables**

**Connection Flow**:
1. JWT middleware extracts `merchant_id` from token claims
2. Lookup Supabase project credentials using merchant_id  
3. Establish database connection for request scope
4. All operations use merchant-scoped connection

**Credential Management** (Initial Scale: 1-2 merchants):
```bash
# Environment variables per merchant
MERCHANT_ACME_SUPABASE_URL=https://acme.supabase.co
MERCHANT_ACME_SUPABASE_ANON_KEY=eyJ0eXAi...
MERCHANT_ACME_SUPABASE_SERVICE_KEY=eyJ0eXAi...

MERCHANT_DEMO_SUPABASE_URL=https://demo.supabase.co  
MERCHANT_DEMO_SUPABASE_ANON_KEY=eyJ0eXAi...
MERCHANT_DEMO_SUPABASE_SERVICE_KEY=eyJ0eXAi...
```

**Connection Pool Strategy**:
- Separate connection pools per merchant
- Lazy initialization for new merchants
- Pre-warm pools for active merchants

**Implementation Pattern**:
```typescript
// JWT middleware extracts merchant_id
const merchantId = jwt.claims.merchant_id;

// Dynamic Supabase client resolution  
const supabaseClient = getSupabaseClient(merchantId);

// All operations scoped to merchant database
const result = await supabaseClient
  .from('ledger_entries')
  .insert(entry);
```

**Benefits**:
- Leverages existing JWT authentication decision
- Simple credential management for initial scale
- Complete data isolation guaranteed
- Railway environment variable friendly
- Easy to migrate to config mapping when scaling

**Future Evolution**: Can migrate to JSON config mapping when merchant count grows beyond environment variable management comfort.

### 6. Error Handling and Observability Strategy ✅

**Decision: Ledger-First Audit + Sentry for Operational Events**

**Financial Compliance Logging**:
- **Ledger entries ARE the audit trail** - complete financial transaction history
- No redundant command-level logging for successful operations
- Ledger contains: merchant_id, user_id, operation context, timestamps, justifications

**Operational Event Logging** (via Sentry):
- Failed operations (validation errors, insufficient balance, expired operations)
- System errors (database connection, authentication failures)
- Security events (unauthorized access attempts, invalid tokens)
- Performance monitoring (operation timeouts, connection pool health)
- Idempotency conflicts and duplicate request patterns

**Error Response Structure** (Effect Framework):
- **Tagged errors** for type-safe financial error handling
- **Domain errors**: InsufficientBalance, OperationExpired, DuplicateKey
- **System errors**: DatabaseConnection, ValidationFailure  
- **Security errors**: Unauthorized, InvalidMerchant

**Monitoring Strategy**:
- **Financial Metrics**: Success/failure rates per operation type, merchant-scoped
- **System Health**: Multi-tenant connection status, operation timeout frequencies
- **Security Monitoring**: Authentication failure patterns, suspicious merchant access

**Benefits**:
- Avoids duplicate logging (ledger + command logs)
- Leverages existing Sentry infrastructure choice
- Effect's tagged errors align with framework selection
- Lean approach: audit where required, operational logging where useful

### 7. Performance & Scaling Strategy ✅

**Decision: Selective Partitioning with Balance Caching**

**Partitioning Strategy** (Per Merchant Database):
- **`ledger_entries`**: Monthly partitions - primary scaling concern for append-only financial records
- **`operation_records`**: Monthly partitions - retained forever for audit trail, moderate growth
- **`receipts`**: Yearly partitions - less frequent writes, long-term retention per merchant policy
- **`idempotency_tracking`**: No partitioning needed - 7-day cleanup window keeps table small

**Balance Optimization**:
- Maintain `user_balance` cache table updated in same transaction as ledger entries
- Cache becomes source of truth for balance queries instead of `SUM(amount)` calculation
- Periodic reconciliation job for integrity validation
- Supports the domain's balance calculation while enabling fast reads

**Index Strategy**:
```sql
-- Core performance indexes per merchant database
CREATE INDEX idx_ledger_user_time ON ledger_entries (user_id, created_at DESC);
CREATE INDEX idx_ledger_lot_id ON ledger_entries (lot_id) WHERE lot_id IS NOT NULL;
CREATE INDEX idx_idempotency_key ON idempotency_tracking (idempotency_key);
CREATE INDEX idx_balance_user ON user_balance (user_id);
```

**Data Lifecycle Management**:
- **Idempotency Cleanup**: Simple 7-day rolling delete per merchant
- **Partition Archival**: Old partitions detached but retained for 7+ year regulatory compliance
- **Partition Pruning**: Automatic query optimization for time-range history queries

**Scaling Benefits**:
- Multi-tenant isolation means each merchant's growth is independent
- Supabase handles underlying infrastructure scaling per project
- Append-only design with monthly partitions scales to 100M+ rows per merchant
- Balance cache eliminates expensive aggregation queries on large ledgers

**Rationale**: Selective approach applies partitioning only where growth occurs, maintaining the lean system philosophy while ensuring performance at scale.

### 8. Authentication & Authorization Details ✅

**Decision: Permanent JWT Tokens for Service-to-Service Communication**

**JWT Token Strategy**:
- **Permanent tokens** issued during merchant creation/onboarding
- **Private network assumption**: Credit service and upstream apps run as Railway services in private network
- **Single operator model**: CLI used only by single admin (you) for merchant management

**Token Structure**:
```json
{
  "sub": "service-account-id",
  "merchant_id": "acme-corp", 
  "aud": "credit-ledger-api",
  "scope": "ledger:read ledger:write",
  "iat": 1640995200,
  "exp": null // No expiration for service tokens
}
```

**Authentication Flow**:
- **Service-to-Service**: Upstream app uses permanent JWT in Authorization header
- **CLI Authentication**: Same permanent JWT stored in environment variable (`CREDIT_SERVICE_JWT`)
- **Merchant Context**: Extracted from `merchant_id` claim, used for Supabase project routing

**Security Boundaries**:
- **Network Security**: Private Railway network prevents external access
- **Token Scope**: Each token scoped to specific merchant operations only
- **No User Tokens**: End users never directly authenticate with credit service

**Benefits**:
- Eliminates token refresh complexity for service-to-service communication
- Simple credential management aligned with single-operator model
- Railway environment variable friendly
- Clear security boundary through private network assumption

### 9. Background Jobs & Scheduling ✅

**Decision: Railway Cron Jobs for Simplicity**

**Job Scheduling Strategy**:
- **Railway Cron**: Simple, integrated with existing deployment
- **Per-Merchant Isolation**: Each job handles all merchants (cheaper than separate crons)
- **Cost Optimization**: Single cron service handles all background tasks

**Scheduled Jobs**:
```bash
# Railway cron service configuration
0 2 * * * /app/jobs/cleanup-operations     # Daily at 2 AM
0 3 * * * /app/jobs/expire-lots           # Daily at 3 AM  
0 4 * * * /app/jobs/cleanup-idempotency   # Daily at 4 AM
```

**Job Implementation Pattern**:
```typescript
// Process all merchants in single job run
const merchants = await getAllMerchants();
for (const merchantId of merchants) {
  const client = getSupabaseClient(merchantId);
  await cleanupExpiredOperations(client, merchantId);
}
```

**Failure Handling**:
- **Idempotent Jobs**: Safe to retry, skip already processed items
- **Per-Merchant Error Isolation**: One merchant's failure doesn't block others
- **Railway Logging**: Built-in job execution logs and failure notifications

**Benefits**:
- **Simple & Cheap**: Single Railway cron service for all background work
- **Integrated**: Uses same codebase and Supabase connections as main service
- **Reliable**: Railway handles cron scheduling and failure notifications

### 10. Deployment & DevOps ✅

**Decision: Platform-Native DevOps with Minimal Custom Infrastructure**

**Deployment Strategy**:
- **Railway**: Handles all application hosting, scaling, and monitoring
- **Supabase**: Provides database hosting, backups, and connection pooling per merchant
- **Zero Custom DevOps**: Rely entirely on platform services for operational concerns

**Infrastructure Components**:
- **Main Service**: Railway service running Effect/RPC server
- **Cron Service**: Railway cron service for background jobs  
- **Databases**: Individual Supabase projects per merchant (complete isolation)
- **Monitoring**: Railway built-in metrics + Sentry for application errors

**Configuration Management**:
- **Environment Variables**: Railway environment variable management for all configuration
- **Secrets**: Railway secrets for JWT signing keys and Supabase credentials
- **No Config Files**: All configuration through platform environment management

**Operational Benefits**:
- **Zero Server Management**: Railway handles all infrastructure concerns
- **Automatic Scaling**: Both Railway and Supabase auto-scale based on usage
- **Built-in Monitoring**: Platform-native observability and alerting
- **Disaster Recovery**: Supabase handles database backups and point-in-time recovery per merchant

**Cost Optimization**:
- **Pay-per-use**: Both platforms scale to zero when unused
- **No DevOps Team**: Single developer can manage entire system through platform UIs
- **Consolidated Billing**: Clear cost tracking through platform billing

**Rationale**: Leverage platform services for all operational complexity, allowing focus on business logic implementation.

### 11. Testing Strategy ✅

**Decision: TDD with Effect Test Framework and Critical Path Coverage**

**Testing Philosophy**:
- **Test-Driven Development**: Write tests first, especially for core financial operations
- **Critical Path Focus**: Test the scenarios that matter most for business correctness
- **Effect-First**: Leverage Effect's built-in testability and deterministic error handling
- **Pragmatic Coverage**: Target critical business logic, not exhaustive line coverage

**Test Categories & Priority**:

**Priority 1 - Core Financial Logic**:
```typescript
// Domain invariants and business rules
describe("Purchase Settlement", () => {
  it("creates exactly one credit lot per settlement")
  it("prevents duplicate settlements with same external_ref")
  it("calculates correct credit amounts from product templates")
  it("handles currency and country-specific pricing")
})

describe("Operation Execution", () => {
  it("debits credits using FIFO lot consumption")
  it("allows overdraft when lots are consumed")
  it("prevents operation execution after timeout")
  it("maintains rate stability during operation lifecycle")
})
```

**Priority 2 - Idempotency & Concurrency**:
```typescript
describe("Idempotency Behavior", () => {
  it("returns same result for duplicate requests within 7-day window")
  it("handles concurrent requests with PENDING state management")
  it("distinguishes between retriable and final failures")
  it("generates deterministic transaction IDs")
})
```

**Priority 3 - Infrastructure & Authentication**:
```typescript
describe("Connection & Auth", () => {
  it("handles invalid JWT signatures gracefully")
  it("handles Supabase connection failures with retries")
  it("validates merchant_id maps to existing Supabase project")
})
```

**Testing Infrastructure**:
- **Effect.test**: Primary testing framework with built-in mocking and services
- **Test Supabase Projects**: Separate test databases per merchant for integration tests
- **In-Memory Services**: Mock Supabase clients for unit tests
- **Property-Based Testing**: Use Effect's generators for edge case discovery

**Test Data Strategy**:
```typescript
// Deterministic test scenarios
const TestScenarios = {
  merchants: ["test-acme", "test-demo"],
  users: ["user-123", "user-456"], 
  products: [
    { code: "basic", credits: 100, price: 9.99 },
    { code: "premium", credits: 500, price: 29.99 }
  ]
}

// Clean slate per test
beforeEach(() => cleanupTestDatabases())
```

**Integration Test Approach**:
- **Real Supabase**: Use dedicated test projects for end-to-end scenarios
- **Background Jobs**: Test cron job execution with test data

**What We Don't Test**:
- **Platform Services**: Railway and Supabase internal behavior  
- **Human Operational Errors**: Wrong JWT usage, credential leaks
- **Cross-Merchant Access**: Architecturally impossible with separate databases

**Benefits**:
- **TDD Workflow**: Tests guide implementation design from the start
- **Effect Integration**: Natural fit with Effect's service-based architecture
- **Financial Confidence**: Core money operations thoroughly validated
- **Rapid Feedback**: Fast test execution enables confident refactoring

**Rationale**: Focus testing effort where business risk is highest - financial accuracy, data isolation, and idempotency guarantees.

### 12. Error Handling Strategy ✅

**Decision: Minimal Typed Errors with Top-Level Fatal Catch**

**Error Categories**:
```typescript
// Known business errors - typed and recoverable
type DomainError = 
  | InsufficientBalance 
  | OperationExpired
  | DuplicateSettlement
  | InvalidProduct
  | AuthenticationFailed
  | ConnectionTimeout

// Unknown errors - caught at top level
type FatalError = Cause.UnknownException
```

**Error Flow**:
- **Business Errors**: Typed, expected, handled gracefully with structured responses
- **Infrastructure Errors**: Timeout/retry policies applied automatically  
- **Unknown Errors**: Caught at RPC boundary, logged, return generic "internal error" to client

**Retry Policy**:
```typescript
// Automatic retries for transient failures
const retryPolicy = Schedule.exponential("100 millis").pipe(
  Schedule.intersect(Schedule.recurs(3))
)
```

**Benefits**:
- **Effect Alignment**: Leverages Effect's tagged error system naturally
- **Client Safety**: Known errors provide actionable feedback, unknown errors are sanitized
- **Operational Visibility**: Fatal errors logged for investigation

**Rationale**: Minimal error surface with clear boundaries between expected business failures and unexpected system failures.

### 13. Database Migration Strategy ✅

**Decision: Effect PgMigrator with Per-Merchant Orchestration**

**Migration Principles**:
- **Effect-Native**: Use `@effect/sql-pg` PgMigrator for type-safe, forward-only migrations
- **Per-Merchant Execution**: Each Supabase project migrated independently
- **CLI-Orchestrated**: Single migration command iterates through all merchant databases
- **Failure Isolation**: One merchant's migration failure doesn't block others

**Migration Structure**:
```typescript
// src/migrations/0001_initial_schema.ts
export default Effect.flatMap(SqlClient.SqlClient, (sql) => sql`
  CREATE TABLE ledger_entries (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    amount INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`)
```

**Orchestration Pattern**:
```bash
# CLI command runs migrations across all merchants
credit-cli migrate run --version=latest
# Iterates: for each merchant -> connect -> migrate -> report status
```

**Benefits**:
- **Type Safety**: Migrations written as Effect programs with full TypeScript support
- **Independent Scaling**: Each merchant database evolves independently
- **Operational Control**: Clear migration status per merchant, rollback capabilities
- **Effect Integration**: Natural fit with existing Effect/SQL architecture

**Rationale**: Leverage Effect's migration system while maintaining merchant isolation and operational simplicity.

