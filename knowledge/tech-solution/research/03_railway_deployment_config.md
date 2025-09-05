# Railway Deployment Configuration

## 1. Service Setup

**Create two Railway services from same repo:**
- **Web Service**: Main HTTP server (`apps/server`)  
- **Cron Service**: Background jobs (`apps/server` with different entry point)

## 2. Web Service Configuration

```json
// railway.json in project root
{
  "$schema": "https://schema.up.railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm run start:server"
  }
}
```

**Service Settings:**
- **Watch Paths**:
  ```
  apps/server/**
  packages/rpc/**
  packages/client/**
  packages/shared/**
  ```
- **Don't set Root Directory** (breaks workspace dependencies)

## 3. Cron Service Configuration

```json
// railway-cron.json (optional separate config)
{
  "deploy": {
    "startCommand": "npm run jobs:cleanup"
  }
}
```

**Cron Schedule** (in service settings):
```
0 2 * * * # Daily at 2 AM
```

**Job Requirements:**
- Jobs must exit after completion
- No persistent processes
- If previous job still running, next execution skipped

## 4. Package.json Scripts

```json
{
  "scripts": {
    "build": "npm run build --workspaces",
    "start:server": "npm run start --workspace=apps/server",
    "jobs:cleanup": "npm run cleanup --workspace=apps/server"
  }
}
```

## 5. Multi-tenant Environment Variables

**Per-merchant database URLs:**
```bash
MERCHANT_ACME_DATABASE_URL=postgres://user:pass@host:5432/acme
MERCHANT_DEMO_DATABASE_URL=postgres://user:pass@host:5432/demo
```

**Set at Railway project level**, accessible by all services.

## 6. Build Process

**Automatic:** Railway's Nixpacks detects workspace dependencies and builds packages in correct order. No manual dependency management needed.

## Key Points

- **Watch paths prevent unnecessary rebuilds** when unrelated code changes
- **Shared codebase** between web and cron services using different entry points  
- **Workspace dependencies resolved automatically** by Railway's build system
- **Environment variables shared** across services at project level
