# Railway Deployment Configuration

## Service Setup

**Single Railway service:**
- **creditService**: HTTP RPC server (`apps/server`)

Background jobs run via PostgreSQL pg_cron within merchant databases.

## creditService Configuration

```json
// railway.json in project root
{
  "$schema": "https://schema.up.railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install --frozen-lockfile && pnpm -w run build"
  },
  "deploy": {
    "startCommand": "node apps/server/build/esm/server.js"
  }
}
```

**Service Settings:**
- **Watch Paths**:
  ```
  apps/server/**
  packages/rpc/**
  packages/shared/**
  ```
- **Don't set Root Directory** (breaks workspace dependencies)

## Package.json Scripts

```json
{
  "scripts": {
    "build": "tsc -b tsconfig.build.json && pnpm --recursive --parallel run build",
    "start:server": "cd apps/server/build && node esm/server.js"
  }
}
```

## Environment Variables

**Required variables at Railway project level:**

```bash
# Authentication
JWT_SECRET=your-jwt-secret

# Service config
SERVICE_NAME=credit-system

# Multi-tenant database URLs (add per merchant)
MERCHANT_ACME_DATABASE_URL=postgres://user:pass@host:5432/acme
MERCHANT_DEMO_DATABASE_URL=postgres://user:pass@host:5432/demo
```

## Build Process

Railway's Nixpacks detects workspace dependencies and builds packages in correct order. No manual dependency management needed.

## Key Points

- **Watch paths prevent unnecessary rebuilds** when unrelated code changes
- **Workspace dependencies resolved automatically** by Railway's build system
- **Environment variables accessible** by the service
- **Background jobs handled by pg_cron** in merchant databases
