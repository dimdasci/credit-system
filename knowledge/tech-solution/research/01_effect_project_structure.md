# Effect Project Setup Instructions

## Setup Commands

1. **Initialize Effect monorepo**:
```bash
npx create-effect-app@latest --template monorepo --eslint .
```

2. **Restructure to apps/packages**:
```bash
mkdir apps
mv packages/server apps/server
mv packages/cli apps/cli
mv packages/domain packages/rpc
mkdir packages/client packages/shared
```

3. **Update package.json workspaces**:
```json
{
  "workspaces": ["apps/*", "packages/*"]
}
```

## Final Structure
```
apps/
├── server/     # Railway deployable HTTP server
└── cli/        # Admin CLI tool
packages/
├── rpc/        # Effect schemas + request tags
├── client/     # RPC client factory  
└── shared/     # Domain logic + utilities
```

## Required Dependencies
- `effect` - Core Effect library
- `@effect/platform` - Platform abstractions  
- `@effect/platform-node` - Node.js platform
- `@effect/sql` - Database support

The Effect template provides these automatically.