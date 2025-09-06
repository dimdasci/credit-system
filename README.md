# Credit Management System

Multi-tenant credit ledger service built with Effect framework and TypeScript.

## Prerequisites

- Node.js 20+
- pnpm 10.14.0+

## Local Development Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Environment Setup

Copy environment template and configure:

```bash
# Environment variables are managed via direnv
# Create .env file for secrets (already gitignored)
touch .env

# Example .env contents:
# GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here
# JWT_SECRET=your_jwt_secret
# SENTRY_DSN=your_sentry_dsn
```

### 3. Development Commands

**Type Checking**
```bash
pnpm run check          # Check all packages
pnpm run check-recursive # Deep check with dependencies
```

**Building**
```bash
pnpm run build          # Build all packages
pnpm run clean          # Clean build artifacts
```

**Code Quality**
```bash
pnpm run lint           # Check code formatting
pnpm run lint-fix       # Auto-fix formatting issues
```

**Testing**
```bash
pnpm run test           # Run all tests
pnpm run coverage       # Run tests with coverage
```

**Development Server**
```bash
pnpm run dev            # Start development server
```

**CLI Tool**
```bash
# Build the project including the CLI
pnpm run build

# Run the CLI using the convenience script (recommended)
pnpm run cli

# OR run directly using node (from project root)
node apps/cli/build/esm/bin.js

# OR from the CLI package directory
cd apps/cli
node build/esm/bin.js

# CLI options
pnpm run cli -- --help     # Show help
pnpm run cli -- --version  # Show version
```

### 4. Monorepo Structure

```
apps/
├── server/             # HTTP RPC server (main application)
└── cli/               # Admin CLI tool

packages/
├── shared/            # Domain logic and utilities
├── rpc/              # RPC contracts and schemas  
└── client/           # RPC client factory
```

### 5. Package Management

This project uses pnpm workspaces. To work with specific packages:

```bash
# Run command in specific package
pnpm --filter @credit-system/server run dev
pnpm --filter @credit-system/cli run build

# Install dependency to specific package
pnpm --filter @credit-system/server add new-dependency
```

## Documentation

- **Domain Requirements**: [knowledge/domain/](./knowledge/domain/)
- **Technical Architecture**: [knowledge/tech-solution/](./knowledge/tech-solution/)
- **Project Guidelines**: [knowledge/guidelines/](./knowledge/guidelines/)

## Quick Start

1. Install dependencies: `pnpm install`
2. Check setup: `pnpm run check`
3. Build project: `pnpm run build`  
4. Start development: `pnpm run dev`

The development server will start on http://localhost:3000 with a health endpoint at `/health`.

