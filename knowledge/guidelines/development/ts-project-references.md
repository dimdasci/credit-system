# TypeScript Project References: Preventing Import/Build Errors

This guide documents practical rules to avoid TS project reference issues (e.g., TS6305) in our pnpm monorepo.

## Common Error

- TS6305: “Output file ... has not been built from source file ...”
- Typical cause: An app references a package’s aggregate tsconfig (which in turn references test configs that emit declarations), so TypeScript expects declaration outputs in unexpected locations like `build/test/src`.

## Rules

- Use per-target references in apps
  - In app tsconfigs, reference package `tsconfig.src.json` directly, not the package root `tsconfig.json`.
  - Example (server):
    - `apps/server/tsconfig.src.json` →
      - `"references": [{ "path": "../../packages/shared/tsconfig.src.json" }, ...]`

- Keep test projects no-emit
  - In `packages/*/tsconfig.test.json`, set:
    - `"noEmit": true`
    - `"outDir"` optional; avoid emitting `.d.ts` under `build/test`.

- Separate build outputs
  - Library builds: emit ESM to `build/esm` and declarations to `build/dts` (see `tsconfig.build.json`).
  - Source check (tsconfig.src.json): can emit JS to `build/src` if needed, but avoid mixing test outputs.

- Reference only what you need
  - Aggregator tsconfigs (package root) may include both `src` and `test` for local workflows; apps should not reference aggregator configs.

- Clean and rebuild when in doubt
  - `pnpm run clean` then `pnpm run build` to realign project refs and outputs.

## Quick Checklist

- App → package refs point to `tsconfig.src.json` only
- Tests use `noEmit: true`
- No declarations emitted into `build/test` for library packages
- Full build works: `pnpm run build`, then `pnpm run check`

## Rationale

- Reduces cross-project coupling by avoiding implicit inclusion of test configs in app builds.
- Keeps declaration outputs predictable for TypeScript’s incremental build.

## Example: apps/server/tsconfig.src.json

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"],
  "references": [
    { "path": "../../packages/rpc/tsconfig.src.json" },
    { "path": "../../packages/shared/tsconfig.src.json" },
    { "path": "../../packages/client/tsconfig.src.json" }
  ],
  "compilerOptions": {
    "types": ["node"],
    "outDir": "build/src",
    "tsBuildInfoFile": ".tsbuildinfo/src.tsbuildinfo",
    "rootDir": "src"
  }
}
```

## Optional Hardening

- In each `packages/*/tsconfig.test.json`:
  - Set `"noEmit": true` to prevent test builds from polluting declaration outputs.
- Consider a dedicated root `tsconfig.test.json` for workspace test runs that references only test targets.

