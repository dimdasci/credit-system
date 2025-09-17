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

### Error Handling
- Domain-specific errors in `domain/shared/DomainErrors.ts`
- Effect-based error handling throughout services
- Database errors mapped to domain errors in repositories

## Benefits of This Structure

1. **Immediate Clarity**: Developer instantly understands this is a credit management system
2. **Pragmatic Separation**: Clean boundaries without over-engineering
3. **Effect-First**: Leverages modern Effect patterns for composition and safety
4. **SQL Efficiency**: Database handles what it does best (aggregations, filtering)
5. **Maintainability**: Business logic in services, data structures in domain
6. **Testability**: Easy mocking with Effect.Service patterns
7. **Onboarding**: Business concepts clear, implementation patterns consistent

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

## Testing Structure

### Purpose

Define testing organization that mirrors the simplified architecture, with domain schema tests and service implementation tests using Effect.Service patterns.

### Testing Principles

1. **Domain-First Testing**: Test structure reflects business aggregates
2. **Effect.Service Testing**: Use built-in mock patterns for service testing
3. **SQL-First Testing**: Test database queries and business logic together
4. **Pragmatic Focus**: Test business rules and data integrity, not abstract interfaces

### Test Directory Structure

```
apps/server/test/
├── domain/                                    # Schema validation tests
│   ├── credit-ledger/
│   │   ├── LedgerEntry.test.ts               # Schema validation and business rules
│   │   └── Lot.test.ts                       # Schema validation and constraints
│   ├── operations/
│   │   ├── Operation.test.ts                 # Operation lifecycle schema
│   │   └── OperationType.test.ts             # Rate and billing validation
│   ├── products/
│   │   └── Product.test.ts                   # Product schema and pricing rules
│   ├── receipts/
│   │   └── Receipt.test.ts                   # Receipt schema validation
│   └── shared/
│       ├── Credits.test.ts                   # Credit value object validation
│       ├── UserId.test.ts                    # User ID validation
│       └── DomainErrors.test.ts              # Error type definitions
│
├── services/                                  # Service implementation tests
│   ├── repositories/                          # Repository Effect.Service tests
│   │   ├── ProductRepository.test.ts         # SQL operations + business logic
│   │   ├── LedgerRepository.test.ts          # Ledger operations + balance queries
│   │   ├── OperationRepository.test.ts       # Operation lifecycle persistence
│   │   └── ReceiptRepository.test.ts         # Receipt persistence and retrieval
│   ├── business/                             # Business service tests
│   │   ├── LedgerService.test.ts            # Credit lot creation and consumption
│   │   ├── ProductCatalog.test.ts           # Product availability and pricing
│   │   └── ReceiptGenerator.test.ts         # PDF generation with tax compliance
│   └── integration/                          # Cross-service integration tests
│       ├── merchant-isolation.test.ts        # Multi-tenant data isolation
│       ├── transaction-boundaries.test.ts    # Database transaction tests
│       └── service-composition.test.ts       # Effect.Service dependency chains
│
├── fixtures/                                 # Shared test data and setup
│   ├── test-data.ts                         # Sample entities by aggregate
│   ├── database-setup.ts                    # Test database configuration
│   └── effect-runtime.ts                    # Test Effect runtime configuration
│
└── utils/                                    # Test utilities
    ├── effect-helpers.ts                    # Effect.Service testing patterns
    └── database-helpers.ts                  # Database testing utilities
```

### Test Categories by Layer

#### Domain Schema Tests
**Purpose**: Validate data structures and business validation rules

**Test Types**:
- **Schema Validation Tests**: Effect Schema parsing and validation
- **Business Rule Tests**: Domain constraints and invariants  
- **Value Object Tests**: Immutable value validation
- **Error Type Tests**: Domain error definitions

**Example Focus**:
```typescript
// Test schema validation and business rules
describe("Product Schema", () => {
  it("grant products require grant_policy")
  it("sellable products cannot have grant_policy") 
  it("pricing follows country->fallback hierarchy validation")
  it("effective_at must be <= archived_at when both present")
})
```

#### Service Implementation Tests  
**Purpose**: Validate Effect.Service implementations with database operations

**Test Types**:
- **Repository Tests**: SQL operations with business logic validation
- **Service Integration Tests**: Effect.Service composition and dependencies
- **Mock Testing**: Built-in Effect.Service mock patterns
- **Database Tests**: Query correctness, constraints, and isolation

**Example Focus**:
```typescript
// Test Effect.Service implementations
describe("ProductRepository Service", () => {
  it("getActiveProducts filters by effective/archived dates in SQL")
  it("createProduct respects merchant isolation")
  it("database constraints map to domain errors")
  it("mock service provides test-friendly behavior")
})
```

### Effect.Service Testing Guidelines

#### Service Implementation Tests
**Location**: `test/services/{category}/{ServiceName}.test.ts`
**Focus**: Complete service behavior including database operations

```typescript
describe("ProductRepository Service", () => {
  it("Effect.Service correctly defined with dependencies")
  it("createProduct persists with proper validation")
  it("getActiveProducts uses SQL filtering for performance")
  it("database errors map to domain error types")
  it("Mock service provides consistent test behavior")
})

// Using built-in mock patterns
const testWithMockService = Effect.gen(function* () {
  const repo = yield* ProductRepository
  const result = yield* repo.createProduct(testProduct)
  return result
}).pipe(
  Effect.provide(ProductRepository.Mock)
)
```

### Testing Standards

#### Effect Testing Patterns
All tests use Effect framework for consistency and composition:

```typescript
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

// Domain schema testing
describe("Product Schema", () => {
  it("validates required fields", () => {
    const result = Product.decode(invalidData)
    expect(result._tag).toBe("Left")
  })
})

// Service testing with mocks
describe("ProductRepository Service", () => {
  it("creates products successfully", () =>
    Effect.gen(function* () {
      const repo = yield* ProductRepository
      const result = yield* repo.createProduct(validProduct)
      expect(result).toBeDefined()
    }).pipe(
      Effect.provide(ProductRepository.Mock),
      Effect.runPromise
    )
  )
})
```

#### Test Data and Setup
- **Fixtures**: Business-focused test data by aggregate
- **Database**: Isolated test database with automatic cleanup
- **Effect Runtime**: Shared runtime configuration for tests
- **Mock Services**: Use Effect.Service built-in mock patterns

#### Testing Focus Areas
Every service test should verify:
1. **Schema Validation**: Domain constraints enforced
2. **Business Logic**: Service behavior matches requirements  
3. **SQL Operations**: Database queries work correctly
4. **Error Handling**: Appropriate domain errors returned
5. **Mock Compatibility**: Mock services provide consistent behavior

### Simplified CI Pipeline

#### Test Phases
1. **Schema Tests**: Domain validation (no database needed)
2. **Service Tests**: Effect.Service implementations with test database
3. **Integration Tests**: Cross-service workflows

#### Database Testing
- **Per-suite isolation**: Each service test gets clean database
- **SQL-focused**: Test actual queries, not abstract interfaces
- **Performance aware**: Validate query efficiency and partitioning

This simplified testing approach ensures good coverage while avoiding the complexity of over-layered architectures.