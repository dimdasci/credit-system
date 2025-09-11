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