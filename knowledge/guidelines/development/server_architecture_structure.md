# Server Architecture Structure

## Purpose

This document defines the folder structure for `apps/server/src/` following screaming architecture principles. The structure reflects business domain concepts rather than technical layers, making the system's purpose immediately clear to developers.

## Core Principles

1. **Business-First Organization**: Folder names reflect business concepts, not technical patterns
2. **Domain Encapsulation**: All domain logic stays within the server application boundary
3. **Clear Aggregate Boundaries**: Each business domain has its own folder with complete ownership
4. **Dependency Direction**: Domain → Application → Infrastructure (clean architecture flow)

## Folder Structure

```
apps/server/src/
├── domain/                         # Pure business logic (no infrastructure dependencies)
│   ├── credit-ledger/              # Core aggregate: credit tracking and balance
│   │   ├── entities/
│   │   │   ├── LedgerEntry.ts      # Immutable credit/debit movement records
│   │   │   └── Lot.ts              # Conceptual credit issuance (alias for initial entry)
│   │   ├── services/
│   │   │   ├── LedgerService.ts    # Lot creation and debit recording
│   │   │   └── BalanceCalculator.ts # User balance computation
│   │   └── algorithms/
│   │       ├── FifoSelection.ts    # FIFO lot selection for consumption
│   │       └── BalanceCalculation.ts # Pure balance calculation functions
│   │
│   ├── operations/                 # Credit consumption workflow
│   │   ├── entities/
│   │   │   ├── Operation.ts        # Two-phase operation lifecycle (open/close)
│   │   │   └── OperationType.ts    # Conversion rates and billing rules
│   │   └── services/
│   │       └── OperationService.ts # Operation lifecycle coordination
│   │
│   ├── products/                   # Merchant catalog management
│   │   ├── entities/
│   │   │   └── Product.ts          # Credit packages and pricing templates
│   │   └── services/
│   │       └── ProductCatalog.ts   # Product lifecycle and availability
│   │
│   ├── receipts/                   # Purchase documentation
│   │   ├── entities/
│   │   │   └── Receipt.ts          # Immutable purchase documentation
│   │   └── services/
│   │       └── ReceiptGenerator.ts # PDF receipt generation with tax compliance
│   │
│   └── shared/                     # Cross-domain concepts
│       ├── values/                 # Value objects used across aggregates
│       │   ├── Credits.ts          # Credit amount with validation
│       │   ├── UserId.ts           # User identifier value object
│       │   └── MerchantId.ts       # Merchant identifier value object
│       └── errors/
│           └── DomainErrors.ts     # Domain-specific error types
│
├── application/                    # Use cases and business workflows
│   ├── use-cases/                  # Business workflow orchestration
│   │   ├── PurchaseCredits.ts      # Complete credit purchase workflow
│   │   ├── ConsumeCredits.ts       # Credit consumption via operations
│   │   ├── CalculateBalance.ts     # User balance inquiry workflow
│   │   └── GenerateReceipt.ts      # Receipt generation workflow
│   └── rpc/                        # RPC boundary and contract implementation
│       ├── handlers/               # RPC request handlers
│       └── middleware/             # Request/response middleware
│
└── infrastructure/                 # Technical implementation details
    ├── repositories/               # Data access with multi-tenant isolation
    │   ├── LedgerRepository.ts     # Ledger entry persistence
    │   ├── OperationRepository.ts  # Operation lifecycle persistence
    │   ├── ProductRepository.ts    # Product catalog persistence
    │   └── ReceiptRepository.ts    # Receipt document persistence
    ├── database/
    │   └── ConnectionManager.ts    # Multi-tenant database routing
    └── external/                   # External service integrations
        └── PaymentGateway.ts       # Payment processing integration
```

## Business Aggregates

### Credit Ledger Aggregate
**Responsibility**: Core financial tracking and balance management
**Key Concepts**: Immutable ledger entries, lot-based credit issuance, FIFO consumption
**Files**: `domain/credit-ledger/`

### Operations Aggregate  
**Responsibility**: Credit consumption workflow with rate stability
**Key Concepts**: Two-phase protocol (open → record-and-close), rate capture, timeouts
**Files**: `domain/operations/`

### Products Aggregate
**Responsibility**: Merchant catalog and credit package management
**Key Concepts**: Credit templates, pricing, lifecycle management, grant policies
**Files**: `domain/products/`

### Receipts Aggregate
**Responsibility**: Purchase documentation and tax compliance
**Key Concepts**: Immutable receipts, merchant snapshots, PDF generation
**Files**: `domain/receipts/`

## Dependency Rules

1. **Domain Layer**: No dependencies on infrastructure or external frameworks (except Effect)
2. **Application Layer**: May depend on domain services, coordinates business workflows
3. **Infrastructure Layer**: Implements domain interfaces, handles persistence and external services
4. **Cross-Layer**: Shared value objects and errors may be used across all layers

## Implementation Guidelines

### Entity Design
- Use Effect Schema for validation and type safety
- Entities are immutable value objects with business behavior
- No direct database or infrastructure dependencies in domain entities

### Service Design  
- Domain services coordinate multiple entities within single aggregate
- Application use cases orchestrate across aggregates
- Infrastructure services implement domain interfaces

### Repository Pattern
- Repository interfaces defined in domain layer
- Repository implementations in infrastructure layer
- Multi-tenant isolation handled via MerchantContext

### Error Handling
- Domain-specific errors in `domain/shared/errors/`
- Effect-based error handling throughout
- Infrastructure errors wrapped into domain errors at boundaries

## Benefits of This Structure

1. **Immediate Clarity**: Developer instantly understands this is a credit management system
2. **Domain Focus**: Business logic separated from technical concerns
3. **Maintainability**: Changes to business rules contained within domain boundaries
4. **Testability**: Pure domain functions easily unit tested
5. **Scalability**: Clear boundaries prevent cross-aggregate coupling
6. **Onboarding**: New developers can navigate by business concepts, not technical layers

## Migration from Technical Layers

When refactoring existing layer-based code:

1. **Identify Aggregates**: Group related entities and behaviors
2. **Extract Pure Functions**: Move business logic to domain algorithms  
3. **Define Interfaces**: Create domain interfaces for infrastructure concerns
4. **Move Infrastructure**: Technical concerns go to infrastructure layer
5. **Create Use Cases**: Orchestration logic goes to application layer

This structure ensures the codebase clearly communicates its business purpose while maintaining clean separation of concerns.

## Testing Structure

### Purpose

Define testing organization that mirrors the screaming architecture structure, ensuring tests reflect business domain concepts while maintaining proper separation of concerns and test types.

### Testing Principles

1. **Domain-First Testing**: Test structure reflects business aggregates, not technical layers
2. **Layer-Specific Testing**: Each architectural layer has appropriate test types  
3. **Effect-Based Testing**: All tests use Effect framework patterns for composition and error handling
4. **Business-Focused Assertions**: Test business rules and domain invariants, not implementation details

### Test Directory Structure

```
apps/server/test/
├── domain/                                    # Pure business logic tests
│   ├── invariants.test.ts                    # Domain entity schema validation
│   ├── credit-ledger/
│   │   ├── entities/                          # Entity business logic tests
│   │   │   ├── LedgerEntry.test.ts
│   │   │   └── Lot.test.ts
│   │   └── repositories/                      # Repository interface contracts
│   │       └── LedgerRepository.contract.test.ts
│   ├── operations/
│   │   ├── entities/
│   │   │   ├── Operation.test.ts
│   │   │   └── OperationType.test.ts
│   │   └── repositories/
│   │       └── OperationRepository.contract.test.ts
│   ├── products/
│   │   ├── entities/
│   │   │   └── Product.test.ts
│   │   └── repositories/
│   │       └── ProductRepository.contract.test.ts
│   ├── receipts/
│   │   ├── entities/
│   │   │   └── Receipt.test.ts
│   │   └── repositories/
│   │       └── ReceiptRepository.contract.test.ts
│   └── shared/
│       ├── values/                            # Value object tests
│       │   ├── Credits.test.ts
│       │   └── MonthDate.test.ts
│       └── errors/                            # Domain error tests
│           └── DomainErrors.test.ts
│
├── infrastructure/                            # Technical implementation tests
│   ├── repositories/                          # Repository implementation tests
│   │   ├── ProductRepositoryImpl.test.ts
│   │   ├── LedgerRepositoryImpl.test.ts
│   │   ├── OperationRepositoryImpl.test.ts
│   │   ├── ReceiptRepositoryImpl.test.ts
│   │   └── error-mapping.test.ts              # Infrastructure->Domain error mapping
│   └── integration/                           # Cross-system integration tests
│       ├── repository-isolation.test.ts       # Merchant isolation verification
│       ├── transaction-boundaries.test.ts     # Database transaction tests
│       └── database-constraints.test.ts       # Database constraint validation
│
├── fixtures/                                  # Shared test data
│   ├── test-data.ts                           # Sample domain entities by aggregate
│   ├── database-setup.ts                      # Test database configuration
│   └── merchant-context.ts                    # Test MerchantContext implementations
│
└── utils/                                     # Test utilities
    ├── effect-helpers.ts                      # Effect testing patterns and helpers
    └── database-helpers.ts                    # Database testing utilities
```

### Test Categories by Layer

#### Domain Layer Tests
**Purpose**: Validate business logic and domain rules without infrastructure dependencies

**Test Types**:
- **Entity Invariant Tests**: Schema validation and business rule enforcement
- **Repository Contract Tests**: Interface compliance and Effect type correctness
- **Pure Function Tests**: Business algorithms and calculations
- **Domain Error Tests**: Error type definitions and business context

**Example Focus**:
```typescript
// Test business rules, not database operations
describe("Product Entity Business Rules", () => {
  it("grant products require grant_policy")
  it("sellable products cannot have grant_policy") 
  it("product pricing resolution follows country->fallback hierarchy")
})
```

#### Infrastructure Layer Tests  
**Purpose**: Validate technical implementations and external integrations

**Test Types**:
- **Repository Implementation Tests**: Database operations and query correctness
- **Error Mapping Tests**: Infrastructure error translation to domain errors
- **Integration Tests**: Database constraints, transactions, and isolation
- **Performance Tests**: Query optimization and partition pruning

**Example Focus**:
```typescript
// Test technical implementations
describe("ProductRepositoryImpl", () => {
  it("SQL queries respect merchant isolation via MerchantContext")
  it("constraint violations map to ProductUnavailable errors")
  it("archived products excluded from active product queries")
})
```

### Repository Testing Guidelines

#### Repository Interface Tests (Domain Layer)
**Location**: `test/domain/{aggregate}/repositories/`
**Focus**: Contract compliance and Effect composition

```typescript
describe("ProductRepository Contract", () => {
  it("all methods return Effect with correct error types")
  it("Context tag is properly defined for dependency injection")
  it("method signatures match domain requirements")
})
```

#### Repository Implementation Tests (Infrastructure Layer)  
**Location**: `test/infrastructure/repositories/`
**Focus**: Database operations and error handling

```typescript
describe("ProductRepositoryImpl", () => {
  it("createProduct persists all fields correctly")
  it("getActiveProducts filters by effective_at and archived_at") 
  it("database errors map to appropriate domain error types")
  it("MerchantContext isolation prevents cross-tenant data access")
})
```

### Testing Standards

#### Effect Testing Patterns
All tests must use Effect framework patterns for consistency:

```typescript
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

// Standard Effect testing pattern
const testProgram = Effect.gen(function* () {
  const repository = yield* ProductRepository
  const result = yield* repository.getProductByCode("PROD_1")
  return result
})

const result = Effect.runSync(Effect.either(testProgram))
expect(result._tag).toBe("Right")
```

#### Test Data Management
- **Fixtures**: Shared test data organized by business aggregate
- **Database Setup**: Isolated test database per test suite
- **MerchantContext**: Test implementations for multi-tenant isolation testing

#### Error Testing Requirements
Every repository test must verify:
1. **Happy Path**: Successful operations return expected results
2. **Business Errors**: Invalid operations return appropriate domain errors
3. **Infrastructure Errors**: Database/connection issues map to ServiceUnavailable
4. **Error Context**: Errors contain sufficient context for upstream handling

### Integration with Continuous Integration

#### Test Execution Phases
1. **Unit Tests**: Domain layer tests (fastest, no external dependencies)
2. **Integration Tests**: Infrastructure tests with test database
3. **End-to-End Tests**: Full application flow tests (if applicable)

#### Test Database Requirements
- **Isolation**: Each test suite uses isolated database schema
- **Cleanup**: Automatic cleanup after test execution
- **Migration**: Test database matches production schema via migrations
- **Partitions**: Test partition creation and pruning logic

This testing structure ensures comprehensive coverage while maintaining the business-focused organization that makes the system's purpose immediately clear to developers.