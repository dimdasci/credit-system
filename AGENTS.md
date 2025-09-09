# Repository Guidelines

Project repository https://github.com/dimdasci/credit-system/. Use MCP tools to work with issues.

## Overview

Credit Lodger is a minimal credit ledger service designed for managing user purchases and credits consumption while upstream service usage. It provides state and API to manage products and ledger, while leaving the purchase transaction logic and integration with payment methods to the upstream services.

## Design Philosophy

**Lean Focused System** - We build focused, minimal systems that do one thing well. Each component has clear boundaries and responsibilities. We avoid feature creep and complexity by pushing authorization, UI, and business logic to appropriate upstream applications while keeping the credit system as a pure accounting ledger.

## Project Structure & Modules
- Monorepo managed by pnpm workspaces.
- Apps: `apps/server` (HTTP RPC server), `apps/cli` (admin CLI).
- Packages: `packages/shared`, `packages/rpc`, `packages/client`.
- Knowledge base: `knowledge/domain`, `knowledge/tech-solution`, `knowledge/guidelines`.
- Path aliases (TypeScript): `@credit-system/{rpc,client,shared}` (see `tsconfig.base.json`).

## Build, Test, and Development
- Install: `pnpm install` (Node 20+, pnpm 10).
- Type check: `pnpm run check` or deep `pnpm run check-recursive`.
- Build all: `pnpm run build` (uses project refs; then builds packages/apps).
- Clean: `pnpm run clean`.
- Test: `pnpm run test`; coverage: `pnpm run coverage`.
- Dev server: `pnpm run dev` (runs `apps/server`).
- CLI: `pnpm run cli` (after build) or `node apps/cli/build/esm/bin.js`.
- Per-package: `pnpm --filter @credit-system/server run dev` (use filters for targeted tasks).
- Avoid running plain tsc or editor “TypeScript: Compile” actions that don’t honor your build tsconfigs.

## Coding Style & Naming
- Language: TypeScript (strict). Imports prefer aliases (`@credit-system/*`).
- Lint/format: ESLint with Effect dprint rules. Run `pnpm run lint` / `pnpm run lint-fix`.
- Formatting (enforced): 2-space indent, 120-char line width, double quotes, no semicolons.
- Naming: `PascalCase` for types/classes, `camelCase` for vars/functions, folders/files kebab-case.

## Testing Guidelines
- Framework: Vitest with workspace config (`vitest.workspace.ts`).
- Location: `test/` per package/app; name files `*.test.ts`.
- Run all or filter: `pnpm test` or `pnpm --filter @credit-system/rpc test`.
- Aim for meaningful unit tests around domain logic; keep fast and deterministic. Use `pnpm coverage` for reports.

## Commit & Pull Requests
- Conventional style preferred: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:` with optional scope (`server|cli|rpc|shared`).
  - Example: `fix(server): resolve startup hanging issue`
  - Example: `feat(cli): add version command`
- PRs: include clear description, linked issues (e.g., `Closes #123`), screenshots or command output for CLI/HTTP changes, and notes on testing.
- Ensure: lint passes, tests green, and docs updated (README/knowledge) when relevant.

## Security & Configuration
- Env via direnv + `.env` (gitignored). Never commit secrets.
- Common keys: `GITHUB_PERSONAL_ACCESS_TOKEN`, `JWT_SECRET`, `SENTRY_DSN`.
- Prefer configuration through env; avoid hard-coded URLs/keys.
