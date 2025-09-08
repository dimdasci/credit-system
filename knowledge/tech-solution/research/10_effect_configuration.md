# Effect Configuration in @effect/platform

This guide shows how to use Effect Config to supply runtime parameters (for example, the HTTP server port) to `@effect/platform` apps. It distills the official Effect docs and aligns with our platform patterns so you can plug configuration into layers cleanly and predictably.

> Official docs: https://effect.website/docs/configuration/

---

## Why Effect Config

> “Efficiently manage application configurations with built-in types, flexible providers, and advanced features like defaults, validation, and redaction.” — Effect Documentation
>
> https://effect.website/docs/configuration/

- Typed descriptors: Define what you need (`number`, `string`, `secret`, `option`) instead of hand-parsing env vars
- Pluggable providers: Read from env, maps, files, or compose custom sources
- First-class in Effect: Works inside `Effect`/`Layer`, integrates with service wiring

---

## Core Concepts

- Config descriptors: Describe shape and constraints
  ```ts
  import { Config } from "effect"

  const ServerConfig = Config.all({
    port: Config.number("PORT").pipe(Config.withDefault(3000))
  })
  ```

- Providers: Tell Effect where to read values from (commonly environment)
  ```ts
  import { ConfigProvider, Layer } from "effect"

  const EnvProviderLayer = Layer.setConfigProvider(ConfigProvider.fromEnv())
  ```

- Reading values: Inside any Effect you can read descriptors
  ```ts
  import { Effect } from "effect"

  const program = Effect.gen(function* () {
    const { port } = yield* ServerConfig
    // use port
  })
  ```

- Secrets and options
  ```ts
  const Secrets = Config.all({
    jwtSecret: Config.secret("JWT_SECRET"),           // redacted in logs
    sentryDsn: Config.option(Config.string("SENTRY_DSN"))
  })
  ```

---

## Using Config with @effect/platform (Server Port)

We want `NodeHttpServer.layer(createServer, { port })` to be driven by configuration (env-first, with a sensible default).

> Pattern summary: Build the platform layer from config using `Layer.unwrap`, and provide an env-backed `ConfigProvider` to the stack.

```ts
import { HttpApiBuilder, HttpMiddleware, HttpServer } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Config, ConfigProvider, Effect, Layer } from "effect"
import { createServer } from "node:http"
import { ApiLive } from "./Api.js"

// 1) Describe needed config
const ServerConfig = Config.all({
  port: Config.number("PORT").pipe(Config.withDefault(3000))
})

// 2) Build a Node server layer from config
const NodeServerFromConfig = Layer.unwrap(
  Effect.gen(function* () {
    const { port } = yield* ServerConfig
    return NodeHttpServer.layer(createServer, { port })
  })
)

// 3) Provide config provider + compose HTTP layer
const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(ApiLive),
  HttpServer.withLogAddress,
  Layer.provide(NodeServerFromConfig),
  Layer.provide(Layer.setConfigProvider(ConfigProvider.fromEnv()))
)

// 4) Launch
Layer.launch(HttpLive).pipe(NodeRuntime.runMain)
```

Notes
- `Layer.unwrap` lets us read config in an effect, then return the concrete platform layer
- `Config.number("PORT").withDefault(3000)` gives safety + local dev default
- `ConfigProvider.fromEnv()` integrates with `process.env` (works with direnv/.env)

---

## Aligning with Our Example

Your `09_effect_platform.md` Hello World example uses a hard-coded port:

```ts
// knowledge/tech-solution/research/09_effect_platform.md (Hello World)
Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
```

The configuration-driven version above is a drop-in replacement that keeps the same composition style but reads `PORT` from the environment with validation and defaults.

- Local: no `.env` → defaults to 3000
- Production: set `PORT` via deployment platform (e.g., Railway)

---

## Extended Patterns

- Group multiple values
  ```ts
  const AppConfig = Config.all({
    serviceName: Config.string("SERVICE_NAME").pipe(Config.withDefault("credit-system")),
    nodeEnv: Config.string("NODE_ENV").pipe(Config.withDefault("development")),
    sentryDsn: Config.option(Config.string("SENTRY_DSN"))
  })
  ```

- Dynamic keys (multi-tenant DB URLs)
  ```ts
  const getMerchantDatabaseUrl = (id: string) =>
    Config.string(`MERCHANT_${id.toUpperCase()}_DATABASE_URL`)
  ```

- Use config inside handlers/services
  ```ts
  import { Effect } from "effect"

  const handler = Effect.gen(function* () {
    const { serviceName } = yield* AppConfig
    // use serviceName in logs/headers
  })
  ```

---

## Minimal .env Example

```
# apps/server/.env (gitignored)
PORT=3000
SERVICE_NAME=credit-system
NODE_ENV=development
JWT_SECRET=dev-secret
# SENTRY_DSN=...
```

With direnv / dotenv tooling, these become available via `process.env` and read by `ConfigProvider.fromEnv()`.

---

## Official Documentation Pointers

- Configuration (Effect docs)
  - Overview and concepts, providers, defaults, redaction
  - https://effect.website/docs/configuration/

Quoted highlight
> “Efficiently manage application configurations with built-in types, flexible providers, and advanced features like defaults, validation, and redaction.”
>
> https://effect.website/docs/configuration/

- Platform runtime (for context on wiring and `runMain`)
  - https://effect.website/docs/platform/runtime/

---

## FAQ

- Why not `process.env.PORT ?? 3000`?
  - Effect Config adds typing, error reporting (`ConfigError`), redaction for secrets, and uniform access across layers/effects.

- Where to provide the provider?
  - As high as possible in your server composition: `Layer.provide(Layer.setConfigProvider(ConfigProvider.fromEnv()))`.

- How does this relate to Swagger/client derivation?
  - Unrelated to derivation itself; config primarily wires runtime parameters (server, clients, DBs) into layers.

---

## Quick Checklist

- Define descriptors with sensible defaults
- Provide `ConfigProvider.fromEnv()` once at the top-layer
- Build platform layers from config using `Layer.unwrap`
- Fail fast on missing required config; use `Config.option` only when truly optional

---

## Project Placement (This Repo)

- Location: define config descriptors in `packages/shared/src/config/Config.ts`.
  - Export grouped descriptors (e.g., `ServiceConfig`, `ServerConfig`, `CliConfig`) and helpers like `getMerchantDatabaseUrl(id)`.
  - Keep this module runtime-agnostic (no `@effect/platform` imports).
- Re-exports: add `packages/shared/src/config/index.ts` to re-export for `@credit-system/shared/config`.
- Provide provider at app edge:
  - `apps/server`: entrypoint wires `Layer.setConfigProvider(ConfigProvider.fromEnv())` and builds server layer from `ServerConfig`.
  - `apps/cli`: entrypoint provides the same env provider and reads `CliConfig`.
- Testing: swap providers (e.g., `ConfigProvider.fromMap`) in tests without touching app code.

References
- Examples in this doc; see also `knowledge/tech-solution/06_implementation_essentials.md` for `ServiceConfig`, `CliConfig`, and `getMerchantDatabaseUrl`.
