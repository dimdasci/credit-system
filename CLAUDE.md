# Overview

Credit Lodger is a minimal credit ledger service designed for managing user purchases and credits consumption while upstream service usage. It provides state and API to manage products and ledger, while leaving the purchase transaction logic and integration with payment methods to the upstream services.

## Design Philosophy

**Lean Focused System** - We build focused, minimal systems that do one thing well. Each component has clear boundaries and responsibilities. We avoid feature creep and complexity by pushing authorization, UI, and business logic to appropriate upstream applications while keeping the credit system as a pure accounting ledger.

## Current state

The project domain requirements is ready. Technical solution is under development. You task is to complete technical solution design and implementation following @knowledge/tech-solution/implementation-outline.md.

## Your role

Act as a senior solution architect to guide the technical design and implementation of the credit management service.

## Knowledge Base

The project documentation is available in the `knowledge` directory:
- `knowledge/domain` contains detailed domain requirements.
- `knowledge/tech-solution` contains technical solution design and implementation details.
