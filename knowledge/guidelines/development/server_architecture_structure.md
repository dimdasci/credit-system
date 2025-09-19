# Server Architecture Structure

## Purpose

This document defines the folder structure for `apps/server/src/` following screaming architecture principles. The structure reflects business domain concepts with pragmatic implementation patterns, making the system's purpose immediately clear while avoiding over-engineering.

## Core Principles

1. **Business-First Organization**: Folder names reflect business concepts, not technical patterns
2. **Pragmatic Separation**: Domain contains pure schemas; services contain business logic and data access
3. **Effect.Service Patterns**: Modern Effect framework patterns for service composition
4. **SQL-First Calculations**: Database handles aggregations; avoid fetching large datasets to sum in JavaScript

## Folder Structure

```
apps/server/src/
├── domain/                         # Pure business schemas (no dependencies except Effect Schema)
│   ├── credit-ledger/
│   │   ├── LedgerEntry.ts          # Schema with validation rules
│   │   └── Lot.ts                  # Schema with business validation
│   ├── operations/
│   │   ├── Operation.ts            # Schema for two-phase operation lifecycle
│   │   └── OperationType.ts        # Schema for conversion rates and billing rules
│   ├── products/
│   │   └── Product.ts              # Schema for credit packages and pricing
│   ├── receipts/
│   │   └── Receipt.ts              # Schema for purchase documentation
│   └── shared/
│       ├── Credits.ts              # Credit amount value object with validation
│       ├── UserId.ts               # User identifier value object
│       ├── MerchantId.ts           # Merchant identifier value object
│       └── DomainErrors.ts         # Domain-specific error types
│
├── services/                       # Business logic and data access using Effect.Service
│   ├── repositories/               # Data access with SQL-first approach
│   │   ├── LedgerRepository.ts     # Effect.Service for ledger operations + balance queries
│   │   ├── OperationRepository.ts  # Effect.Service for operation lifecycle
│   │   ├── ProductRepository.ts    # Effect.Service for product catalog
│   │   └── ReceiptRepository.ts    # Effect.Service for receipt persistence
│   ├── business/                   # Business logic services
│   │   ├── LedgerService.ts        # Effect.Service for credit lot creation and consumption
│   │   ├── ProductCatalog.ts       # Effect.Service for product availability and pricing
│   │   └── ReceiptGenerator.ts     # Effect.Service for PDF generation with tax compliance
│   └── external/
│       ├── DatabaseManager.ts     # Multi-tenant database routing (keep current pattern)
│       └── PaymentGateway.ts       # External service integrations
│
└── application/                    # Use cases and API boundaries
    ├── use-cases/                  # Business workflow orchestration
    │   ├── PurchaseCredits.ts      # Complete credit purchase workflow
    │   ├── ConsumeCredits.ts       # Credit consumption via operations
    │   └── GenerateReceipt.ts      # Receipt generation workflow
    └── rpc/                        # RPC boundary and contract implementation
        ├── handlers/               # RPC request handlers
        └── middleware/             # Request/response middleware
```

## Business Aggregates

### Credit Ledger Aggregate
**Domain Schema**: `domain/credit-ledger/` - Pure data structures and validation
**Business Logic**: `services/repositories/LedgerRepository.ts` + `services/business/LedgerService.ts`
**Key Concepts**: Immutable ledger entries, lot-based credit issuance, SQL-based balance calculation

### Operations Aggregate  
**Domain Schema**: `domain/operations/` - Operation lifecycle schemas
**Business Logic**: `services/repositories/OperationRepository.ts`
**Key Concepts**: Two-phase protocol (open → record-and-close), rate capture, timeouts

### Products Aggregate
**Domain Schema**: `domain/products/` - Product and pricing schemas
**Business Logic**: `services/repositories/ProductRepository.ts` + `services/business/ProductCatalog.ts`
**Key Concepts**: Credit templates, pricing resolution, lifecycle management, grant policies

### Receipts Aggregate
**Domain Schema**: `domain/receipts/` - Receipt document schema
**Business Logic**: `services/repositories/ReceiptRepository.ts` + `services/business/ReceiptGenerator.ts`
**Key Concepts**: Immutable receipts, merchant snapshots, PDF generation with tax compliance

## Dependency Rules

1. **Domain Layer**: Only Effect Schema dependencies for validation and typing
2. **Services Layer**: Can depend on domain schemas, database, and external services
3. **Application Layer**: Depends on services layer, orchestrates business workflows
4. **Cross-Layer**: Domain schemas and errors used across all layers

## Implementation Guidelines

### Domain Schema Design
- Use Effect Schema for validation and type safety
- Pure data structures with business validation rules
- No dependencies on services or infrastructure
- Immutable value objects with schema-based validation

### Service Design  
- Use Effect.Service for service definition and dependency injection
- Repositories handle data access with SQL-first approach
- Business services orchestrate repository operations
- Services own their implementation and dependencies

#### Service Subfolders

- `services/repositories/`: data-access services that translate domain intents into SQL. Everything here should map closely to tables or read models.
- `services/business/`: orchestration layers that compose repositories, enforce invariants, and model business workflows (e.g., settlement, catalog operations).
- `services/external/`: adapters for infrastructure concerns (database manager, payment gateways, notifications). Keep IO-heavy logic here.

When adding a new service, ask:
1. **Does it persist or read data directly?** → place under `repositories/`.
2. **Does it coordinate multiple repositories or enforce cross-aggregate rules?** → place under `business/`.
3. **Does it call third-party systems?** → place under `external/`.

Avoid “misc” folders—if a service doesn’t fit any category, reconsider its responsibilities or create a narrowly scoped subfolder (e.g., `services/business/settlement/`) once multiple related services appear.

### Effect.Service Pattern
```typescript
// services/repositories/ProductRepository.ts
export class ProductRepository extends Effect.Service<ProductRepository>()("ProductRepository", {
  effect: Effect.gen(function* () {
    const db = yield* DatabaseManager
    return {
      createProduct: (product: Product) => 
        // SQL implementation
      getActiveProducts: (options) => 
        // SQL-based filtering and pagination
    }
  }),
  dependencies: [DatabaseManager.Default]
}) {
  // Optional: Mock implementations for testing
  static readonly Mock = ProductRepository.make({
    createProduct: () => Effect.succeed(void 0),
    getActiveProducts: () => Effect.succeed([])
  })
}
```

### Dependency Management and Clean Architecture

To handle service dependencies in a structured way and prevent them from leaking into the service interfaces, use the Layer abstraction for service construction.

When a service has its own requirements, it's best to separate implementation details into layers. Layers act as **constructors for creating the service**, allowing us to handle dependencies at the construction level rather than the service level.

**Key Principle**: Service operations should have the Requirements parameter set to `never`:

```typescript
// ✅ GOOD: Clean service interface - no requirement leakage
getUserBalance: (user_id: string) => Effect.Effect<number, InvalidRequest | ServiceUnavailable>
//                                                                                        ^^^^^
//                                                                           Requirements = never (implicit)

// ❌ AVOID: Requirement leakage - dependencies exposed in service interface
getUserBalance: (user_id: string) => Effect.Effect<number, InvalidRequest | ServiceUnavailable, DatabaseManager>
//                                                                                               ^^^^^^^^^^^^^^^
//                                                                                    Dependencies leaked into interface
```

### Error Handling
- Domain-specific errors in `domain/shared/DomainErrors.ts`
- Effect-based error handling throughout services
- Database errors mapped to domain errors in repositories

## Current Status

**Implemented:**
- Domain layer with pure schemas
- Repository layer with SQL-first approach
- Initial business services (PurchaseSettlementService)
- Database and middleware at root level (temporary)
- API composition at root level (temporary)

**Planned:**
- Application layer with use cases and RPC handlers
- Migration of infrastructure services to `services/external/`
- Additional business services as needed

## Migration from Complex Layer Architectures

When simplifying existing over-engineered code:

1. **Extract Pure Schemas**: Move data structures to `domain/` with validation only
2. **Consolidate Services**: Combine related business logic into Effect.Service classes
3. **SQL-First Refactoring**: Replace in-memory aggregations with database queries
4. **Remove Empty Abstractions**: Eliminate unnecessary interfaces and layers
5. **Flatten Structure**: Remove excessive subfolder nesting

## SQL-First Guidelines

**Do in Database:**
- Balance calculations: `SELECT SUM(amount) FROM ledger_entries WHERE...`  
- FIFO selection: `SELECT * FROM lots WHERE... ORDER BY created_at LIMIT...`
- Date filtering: `WHERE effective_at <= $1 AND (archived_at IS NULL OR archived_at > $1)`
- Aggregations and reporting queries

**Do in Services:**
- Business rule validation
- Multi-step workflows and transactions
- External service integration
- Complex error handling and mapping

This structure ensures the codebase clearly communicates its business purpose while avoiding common over-engineering pitfalls.

## Testing Guidance

Testing strategy intentionally lives in a dedicated document. See
`knowledge/guidelines/development/effect-testing-patterns.md` for the
current Effect-driven testing blueprint, including directory structure,
layer composition, and anti-patterns to avoid.

## Evolving the Structure

The tree above reflects the minimal system in place today. As the platform grows:

- **New aggregates** (e.g., billing, reporting) should mirror the existing pattern: schemas under `domain/`, repositories for persistence, business services for orchestration, and application-level use-cases for API exposure.
- **Cross-cutting workflows** (audit, reconciliation) warrant their own business services rather than forcing logic into repositories.
- **Integration adapters** (Kafka publishers, webhooks) belong under `services/external/` to keep side effects isolated.

Whenever you introduce a new folder, document the intent in this guide so future work stays aligned. Each addition should answer:
1. What business concept does it represent?
2. Which layer owns it (domain, service, application)?
3. How does it interact with existing modules?

Keeping this document updated ensures structural decisions remain explicit and discoverable.
