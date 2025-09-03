# Technical Solution Documentation Outline

This document defines the comprehensive technical documentation structure required for the Credit Management Service. Each section represents a standalone reference document that enables implementation by a junior engineer.

## Purpose

Create detailed technical specifications that serve as implementation blueprints. Each document should be complete, self-contained, and provide enough detail for independent implementation of that component.

## 1. System Architecture Overview

### 1.1 Core System Design
- **Component architecture**: Apps (server, CLI), packages (RPC, client, shared)
- **Multi-tenant model**: JWT merchant_id → Supabase project routing
- **Technology integration**: Effect + Railway + Supabase interaction patterns
- **Project structure**: Monorepo organization, package dependencies

**Essential Figures**:
- **Figure 1.1**: System Overview (components, data flow, multi-tenant isolation)
- **Figure 1.2**: Monorepo Structure (apps/, packages/, build dependencies)

## 2. Database Schema & Migrations

### 2.1 Schema Design
- **Core tables**: ledger_entries, products, operations, idempotency_tracking, user_balance
- **Constraints & indexes**: Primary keys, unique constraints, performance indexes
- **Partitioning**: Monthly partitions for ledger_entries, operations
- **Migration system**: Effect PgMigrator setup, per-merchant execution

**Essential Figures**:
- **Figure 2.1**: Database Schema (tables, relationships, key constraints)
- **Figure 2.2**: Balance Calculation (ledger → FIFO → cache)

## 3. API Contracts & Authentication

### 3.1 RPC Schema & Auth
- **Core schemas**: Purchase.Settled, Operation.Open/RecordAndClose, Grant.Apply, queries
- **Error types**: InsufficientBalance, OperationExpired, AuthenticationFailed
- **JWT structure**: merchant_id claim, permanent tokens, validation middleware
- **Client patterns**: RPC client usage, retry logic, error handling

**Essential Figures**:
- **Figure 3.1**: RPC Request Flow (JWT → validation → handler → response)
- **Figure 3.2**: Authentication & Routing (JWT → merchant_id → Supabase project)

## 4. Core Business Logic

### 4.1 Financial Operations & Idempotency
- **Purchase settlement**: Credit lot creation, FIFO consumption, balance updates
- **Operation lifecycle**: Open → RecordAndClose with timeout handling
- **Idempotency system**: 4-state machine (PENDING/SUCCEEDED/FAILED_RETRIABLE/FAILED_FINAL)
- **Transaction IDs**: UUIDv5 deterministic generation, 7-day cleanup

**Essential Figures**:
- **Figure 4.1**: Purchase Settlement Flow (payment → credits → balance)
- **Figure 4.2**: Operation Lifecycle (open → consume → close/timeout)
- **Figure 4.3**: Idempotency State Machine (states, transitions, cleanup)

## 5. Implementation Essentials

### 5.1 Testing & TDD
- **Test infrastructure**: Effect Test setup, test databases, service mocking
- **TDD approach**: Red-Green-Refactor for core financial operations
- **Critical test coverage**: Purchase settlement, balance calculation, idempotency
- **Integration tests**: RPC client/server, database operations, background jobs

### 5.2 Deployment & Operations
- **Railway setup**: Server deployment, cron jobs, environment variables
- **Background jobs**: Operation cleanup, lot expiry, idempotency cleanup
- **CLI administration**: Merchant management, product catalog, grants/adjustments
- **Operational procedures**: Merchant onboarding, incident response, monitoring

**Essential Figures**:
- **Figure 5.1**: Deployment Overview (Railway + Supabase + monitoring)
- **Figure 5.2**: Background Job Flow (cleanup, expiry, maintenance)

## Documentation Standards

### Document Structure Requirements
- **Self-contained**: Each document must be complete and independently useful
- **Implementation-ready**: Sufficient detail for a junior engineer to implement
- **Code examples**: Concrete TypeScript/Effect examples for all patterns
- **Error scenarios**: Complete error handling and edge case coverage
- **Visual documentation**: Each section includes specific diagrams and figures for clarity

### Optimized Documentation Scope

**5 Essential Documentation Sections**:
1. System Architecture Overview (2 figures)
2. Database Schema & Migrations (2 figures)  
3. API Contracts & Authentication (2 figures)
4. Core Business Logic (3 figures)
5. Implementation Essentials (2 figures)

**Lean Documentation Scope**:
- **5 focused sections** covering implementation essentials
- **11 targeted figures/diagrams** for core concepts only
- **Practical implementation guidance** without over-documentation
- **Focus on high-value, implementation-critical information**

**What We Eliminated**:
- Detailed operational procedures (rely on platform defaults)
- Extensive performance optimization (implement when needed)
- Complex troubleshooting guides (build incrementally)
- Over-engineered integration patterns (keep it simple)
