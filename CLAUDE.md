# Overview

Credit Lodger is a minimal credit ledger service designed for managing user purchases and credits consumption while upstream service usage. It provides state and API to manage products and ledger, while leaving the purchase transaction logic and integration with payment methods to the upstream services.

## Design Philosophy

**Lean Focused System** - We build focused, minimal systems that do one thing well. Each component has clear boundaries and responsibilities. We avoid feature creep and complexity by pushing authorization, UI, and business logic to appropriate upstream applications while keeping the credit system as a pure accounting ledger.

## Knowledge Base

The project documentation is available in the `knowledge` directory:
- `knowledge/domain` contains detailed domain requirements, with summary and index in @knowledge/domain/README.md.
- `knowledge/tech-solution` contains technical solution design and implementation details, @knowledge/tech-solution/README.md.
- `knowledge/guidelines/project/` contains guidelines for github issues usage.
- `knowledge/guidelines/development/` contains coding guidelines and best practices.

## Type Safety

The project is built on Effect framework (https://effect.website/docs/) with strong emphasis on type safety and correctness. The usage of `any` type is prohibited in the codebase to ensure type safety. Every time you face a type error you must treat it as a luck of type system understanding. In that case slow down, read the documentation, effect source code, search for examples, and ask for help if needed.

## Repository

Project repository https://github.com/dimdasci/credit-system/. Use MCP tools to work with issues.

Github CLI tool `gh` is available in the project. 

### Task Definition Rule:

Use only Acceptance Criteria for functional requirements. Skip Implementation Checklist and Definition of Done unless they add unique value:
- Acceptance Criteria: What the feature must do (user/business perspective)
- Implementation Checklist: Only if complex technical steps need tracking
- Definition of Done: Only if non-standard quality gates apply (default: tests pass, code works)

Default assumption: Tasks are done when they work as specified and tests pass. Don't repeat the same requirements in multiple sections.

## Commands

`pnpm run dev` run from project root to start server in the development mode

Avoid running plain tsc or editor “TypeScript: Compile” actions that don’t honor your build tsconfigs.
