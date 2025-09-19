# Development Guidelines Index

## Purpose

This directory contains development workflow guidelines, practices, and procedures for the Credit Management Service project. These guidelines ensure consistent development practices, effective collaboration, and maintainable code quality.

## Guidelines Overview

### [GitHub Workflow](./github-workflow.md)
Comprehensive GitHub workflow practices including:
- **Branch Strategy** - Feature branches with subtask branches
- **Pull Request Process** - Review requirements and merge procedures  
- **Commit Standards** - Message formatting and conventions
- **Code Review** - Quality checklist and response guidelines
- **Conflict Resolution** - Handling merge conflicts and integration issues
- **Emergency Procedures** - Hotfix and rollback processes

**Key Principles:**
- Feature branch workflow with subtask branches for complex tasks
- Each GitHub issue maps to a branch and pull request
- Sequential execution for dependent subtasks, parallel for independent ones
- Clean integration testing on feature branches before main merge

### [Versioning Strategy](./versioning-strategy.md)
Application-centric versioning approach for monorepo management:
- **Application Releases** - Git tags drive server application versioning
- **Package Management** - Independent semantic versioning for packages
- **Build-Time Injection** - Environment variables for version metadata
- **Production Deployment** - Railway integration with version detection
- **Version Endpoint** - `/version` API with comprehensive build information

**Key Features:**
- Clean git tag-based versioning (`v1.2.3`)
- No runtime git commands - build-time injection only
- Fallback strategies for development and production
- Independent package versioning when needed

### [TypeScript Project References](./ts-project-references.md)
Avoid TS6305 and import/build errors in a pnpm monorepo:
- Reference per-target `tsconfig.src.json` from apps (not package aggregators)
- Set `noEmit: true` in `tsconfig.test.json` for packages
- Keep declarations out of `build/test`; emit to `build/dts`
- Clean and rebuild when outputs drift

### [Architectural Principles](./architectural-principles.md)
Key principles for code structure and separation of concerns:
- **Contracts vs. Implementation:** How to properly separate the API contract from the server implementation.
- **Monorepo Dependency Rules:** Guidelines for package dependencies to maintain a clean architecture.
- **Effect Middleware & DI:** The correct patterns for applying middleware and providing services in Effect HTTP.

### [Server Architecture Structure](./server_architecture_structure.md)
Screaming architecture principles for server application structure:
- **Business-Focused Organization** - Folder structure reflects domain concepts, not technical layers
- **Domain Aggregates** - Clear boundaries for credit-ledger, operations, products, and receipts
- **Clean Architecture** - Domain → Application → Infrastructure dependency flow
- **Implementation Guidelines** - Entity design, service patterns, and repository interfaces
- **Migration Strategy** - Refactoring from technical layers to business-focused structure

**Key Benefits:**
- Immediate clarity of system purpose through folder names
- Domain logic encapsulated within server application boundary
- Clean separation between business logic and technical concerns
- Maintainable aggregate boundaries preventing cross-domain coupling

### [Effect Testing Patterns](./effect-testing-patterns.md)
Essential patterns for testing Effect-based services and domain-driven test design:
- **Domain Contract Testing** - Test business behavior, not implementation details
- **Effect Layer Management** - Smart dependency configuration and test isolation
- **Service-Agnostic Errors** - Domain errors represent business scenarios, not technical attribution
- **TDD Principles** - Tests drive implementation based on business requirements
- **Layer Composition Patterns** - Layer.fresh(), dependency injection, and mock management

**Key Insights:**
- Repository dependencies should be dynamic, service dependencies can be static
- Effect.provide chaining causes service lifecycle issues - merge layers instead
- Test the contract (success = service result, failure = domain error), not implementation
- Domain errors are service-agnostic - focus on business failure scenarios


## Development Workflow Summary

```
main
└── task-N-feature-name (feature branch)
    ├── task-N/subtask-1 (blocking subtask)
    ├── task-N/subtask-2 (parallel subtask)  
    └── task-N/subtask-3 (dependent subtask)
```

**Process Flow:**
1. Create feature branch from main for each major task
2. Break complex tasks into subtask issues and branches
3. Develop subtasks with focused pull requests to feature branch
4. Integration test on feature branch as subtasks are merged
5. Final pull request from feature branch to main

## Usage

These guidelines should be followed for all development work on the Credit Management Service. They are designed to work effectively for:

- **Individual development** - Clear structure and practices for solo work
- **Team collaboration** - Coordination and review processes for multiple developers
- **Complex features** - Breaking down large tasks into manageable subtasks
- **Integration testing** - Ensuring components work together correctly
- **Quality assurance** - Code review and testing requirements

## Updates and Evolution

These guidelines are living documents that should be updated based on:
- Project experience and lessons learned
- Team feedback and retrospectives  
- Tool changes and new capabilities
- Industry best practice evolution

All guideline changes should be discussed with the team and documented with rationale for future reference.
