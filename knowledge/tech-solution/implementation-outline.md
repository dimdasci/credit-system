# Technical Solution Documentation Outline

This document defines the comprehensive technical documentation structure required for the Credit Management Service. Each section represents a standalone reference document that enables implementation by a junior engineer.

## Purpose

Create detailed technical specifications that serve as implementation blueprints. Each document should be complete, self-contained, and provide enough detail for independent implementation of that component.

## 1. Business Domain Architecture

### 1.1 Domain Model Composition
- **Core entities**: User, Merchant, Product, Lot, Operation, Receipt (immutable value objects)
- **Business aggregates**: UserAccount (balance + lots + operations), Merchant (config + catalog)
- **Domain services**: LedgerService, BalanceCalculator, OperationManager, ExpiryProcessor
- **Repository boundaries**: LedgerRepository, ProductRepository, MerchantRepository interface contracts

### 1.2 Business Process Flows
- **Purchase settlement**: Payment validation → credit lot creation → receipt generation → balance update
- **Operation lifecycle**: Authorization → reservation → consumption → completion/timeout
- **FIFO consumption**: Lot selection → debit calculation → balance adjustment → audit trail
- **Grant processes**: Welcome grants, promotional credits, administrative adjustments

### 1.3 Effect Service Composition
- **Pure functions**: Balance calculation, FIFO lot selection, credit conversion rates
- **Effect services**: Database operations, idempotency tracking, background job scheduling
- **Business rule enforcement**: Domain invariants vs. application constraints
- **Transaction boundaries**: Financial consistency requirements, multi-table operations

**Essential Figures**:
- **Figure 1.1**: Domain Model (entities, aggregates, relationships, business invariants)
- **Figure 1.2**: Business Process Flow (purchase → credits → consumption → expiry)
- **Figure 1.3**: Effect Service Dependencies (pure functions → services → repositories)

**Notes for Future Implementation**:
- Consider whether UserAccount should be a true aggregate or just a read model
- Evaluate if Operation lifecycle needs state machine pattern or simple status transitions
- Determine optimal transaction scope for purchase settlement (single vs. distributed)
- Plan for domain event patterns if cross-aggregate consistency becomes needed

## 2. System Architecture Overview

### 2.1 Core System Design
- **Component architecture**: Apps (server, CLI), packages (RPC, client, shared)
- **Multi-tenant model**: JWT `sub` (merchant id) → merchant database routing
- **Technology integration**: Effect + Railway + Postgres interaction patterns
- **Project structure**: Monorepo organization, package dependencies

**Essential Figures**:
- **Figure 2.1**: System Overview (components, data flow, multi-tenant isolation)
- **Figure 2.2**: Monorepo Structure (apps/, packages/, build dependencies)

## 3. Database Schema & Migrations

### 3.1 Schema Design
- **Core tables**: ledger_entries, products, operations, idempotency_tracking, user_balance
- **Constraints & indexes**: Primary keys, unique constraints, performance indexes
- **Partitioning**: Monthly partitions for ledger_entries, operations
- **Migration system**: Effect PgMigrator setup, per-merchant execution

**Essential Figures**:
- **Figure 3.1**: Database Schema (tables, relationships, key constraints)
- **Figure 3.2**: Balance Calculation (ledger → FIFO → cache)

## 4. API Contracts & Authentication

### 4.1 RPC Schema & Auth
- **Core schemas**: Purchase.Settled, Operation.Open/RecordAndClose, Grant.Apply, queries
- **Error types**: InsufficientBalance, OperationExpired, AuthenticationFailed
- **JWT structure**: `sub` claim as merchant id, non-expiring token support, validation middleware
- **Client patterns**: RPC client usage, retry logic, error handling

**Essential Figures**:
- **Figure 4.1**: RPC Request Flow (JWT → validation → handler → response)
- **Figure 4.2**: Authentication & Routing (JWT → sub → merchant database)

## 5. Core Business Logic

### 5.1 Financial Operations & Idempotency
- **Purchase settlement**: Credit lot creation, FIFO consumption, balance updates
- **Operation lifecycle**: Open → RecordAndClose with timeout handling
- **Idempotency system**: 4-state machine (PENDING/SUCCEEDED/FAILED_RETRIABLE/FAILED_FINAL)
- **Transaction IDs**: UUIDv5 deterministic generation, 7-day cleanup

**Essential Figures**:
- **Figure 5.1**: Purchase Settlement Flow (payment → credits → balance)
- **Figure 5.2**: Operation Lifecycle (open → consume → close/timeout)
- **Figure 5.3**: Idempotency State Machine (states, transitions, cleanup)

## 6. Implementation Essentials

### 6.1 Testing & TDD
- **Test infrastructure**: Effect Test setup, test databases, service mocking
- **TDD approach**: Red-Green-Refactor for core financial operations
- **Critical test coverage**: Purchase settlement, balance calculation, idempotency
- **Integration tests**: RPC client/server, database operations, background jobs

### 6.2 Deployment & Operations
- **Railway setup**: Server deployment, cron jobs, environment variables
- **Background jobs**: Operation cleanup, lot expiry, idempotency cleanup
- **CLI administration**: Merchant management, product catalog, grants/adjustments
- **Operational procedures**: Merchant onboarding, incident response, monitoring

**Essential Figures**:
- **Figure 6.1**: Deployment Overview (Railway + Postgres + monitoring)
- **Figure 6.2**: Background Job Flow (cleanup, expiry, maintenance)

## Documentation Standards

### Document Structure Requirements
- **Self-contained**: Each document must be complete and independently useful
- **Implementation-ready**: Sufficient detail for a junior engineer to implement
- **Code examples**: Concrete TypeScript/Effect examples for all patterns
- **Error scenarios**: Complete error handling and edge case coverage
- **Visual documentation**: Each section includes specific diagrams and figures for clarity, using Mermaid syntax.
