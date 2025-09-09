# GEMINI.md

## Project Overview

This is a multi-tenant credit ledger service built with the Effect framework and TypeScript. The project is structured as a pnpm monorepo with separate packages for the server, CLI, client, RPC, and shared domain logic.

The core business domain revolves around managing a credit-based system for multiple tenants (merchants). Key concepts include:
- **Products:** Templates for credit lots, which can be sellable or grantable.
- **Lots:** Instances of products, representing a user's credit balance.
- **Ledger:** An immutable record of all credit and debit transactions.
- **Operations:** A two-phase protocol for reserving and consuming credits.

The architecture is based on Domain-Driven Design (DDD) principles, with a clear separation of concerns between the business logic, application layer, and infrastructure.

## Building and Running

### Prerequisites

- Node.js 20+
- pnpm 10.14.0+

### Installation

```bash
pnpm install
```

### Development Commands

- **Type Checking:** `pnpm run check`
- **Building:** `pnpm run build`
- **Linting:** `pnpm run lint`
- **Testing:** `pnpm run test`
- **Development Server:** `pnpm run dev`
- **CLI Tool:** `pnpm run cli`

Avoid running plain tsc or editor “TypeScript: Compile” actions that don’t honor your build tsconfigs.

## Development Conventions

- **Monorepo:** The project uses pnpm workspaces to manage multiple packages.
- **TypeScript:** The entire codebase is written in TypeScript.
- **Effect:** The project heavily utilizes the Effect library for managing side effects, dependency injection, and creating robust, type-safe applications.
- **ESLint:** Code quality is enforced using ESLint with a custom configuration.
- **Vitest:** Testing is done using Vitest.
- **Domain-Driven Design:** The code is structured around the principles of DDD, with a focus on a rich domain model and clear separation of concerns.
- **Immutability:** Products and ledger entries are immutable, ensuring a stable audit trail.
- **Configuration:** Environment variables are used for configuration, with `.env.example` as a template.

## Key Documentation References

This project contains extensive documentation in the `knowledge/` directory. Below are references to the most critical documents for understanding the project.

### Domain & Business Logic

- **[Domain Overview](knowledge/domain/README.md):** The entry point for understanding the business domain, actors, and core concepts.
- **[Ledger & Balance Invariants](knowledge/domain/03_ledger_and_balance_invariants.md):** Defines the core accounting principles, including issuance, consumption, and expiry rules.
- **[Domain Command Catalog](knowledge/domain/07_domain_command_catalog.md):** A complete reference for all write-side operations (commands) in the system.
- **[Queries & Shapes](knowledge/domain/08_queries_and_shapes.md):** A complete reference for all read-side operations (queries).
- **[Idempotency Requirements](knowledge/domain/09_idempotency_requirements.md):** Details the idempotency guarantees for all domain commands.

### Technical Solution & Architecture

- **[Technical Solution Overview](knowledge/tech-solution/README.md):** The entry point for the technical architecture and implementation details.
- **[System Architecture Overview](knowledge/tech-solution/02_system_architecture_overview.md):** High-level overview of the system components, boundaries, and technology stack.
- **[Database Schema & Migrations](knowledge/tech-solution/03_database_schema_migrations.md):** Detailed PostgreSQL schema, partitioning strategy, and migration system design.
- **[API Contracts & Authentication](knowledge/tech-solution/04_api_contracts_authentication.md):** Defines the RPC schemas, JWT-based authentication, and API versioning strategy.
- **[Core Business Logic Implementation](knowledge/tech-solution/05_core_business_logic.md):** Pseudocode and implementation details for the core financial operations.

### Development & Deployment

- **[GitHub Workflow Guidelines](knowledge/guidelines/development/github-workflow.md):** The branch strategy, pull request process, and commit standards.
- **[Railway Deployment Guide](knowledge/guidelines/RAILWAY_DEPLOYMENT_GUIDE.md):** Instructions for deploying the service to Railway.
- **[Issue Tracking Guidelines](knowledge/guidelines/project/issue-tracking.md):** How to use GitHub Issues for project management.
