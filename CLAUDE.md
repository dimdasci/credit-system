# Overview

Credit Lodger is a minimal credit ledger service designed for managing user purchases and credits consumption while upstream service usage. It provides state and API to manage products and ledger, while leaving the purchase transaction logic and integration with payment methods to the upstream services.

## Design Philosophy

**Lean Focused System** - We build focused, minimal systems that do one thing well. Each component has clear boundaries and responsibilities. We avoid feature creep and complexity by pushing authorization, UI, and business logic to appropriate upstream applications while keeping the credit system as a pure accounting ledger.

## Knowledge Base

The project documentation is available in the `knowledge` directory:
- `knowledge/domain` contains detailed domain requirements, with summary and index in @knowledge/domain/README.md.
- `knowledge/tech-solution` contains technical solution design and implementation details, @knowledge/tech-solution/README.md.
- `knowledge/guidelines/project/issue-tracking.md` contains guidelines for github issues usage.

## Repository

Project repository https://github.com/dimdasci/credit-system/. Use MCP tools to work with issues.

Github CLI tool `gh` is available in the project. 

## Commands

`pnpm run dev` run from project root to start server in the development mode
