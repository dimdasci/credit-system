# Sentry Integration (Effect + OpenTelemetry)

Lean, minimal setup for a new service with zero users: full‑fidelity errors, traces, and profiles in Sentry using OpenTelemetry. Copy these snippets and you’re instrumented end‑to‑end.

## 1) Install

```bash
pnpm add @sentry/node @sentry/profiling-node @sentry/opentelemetry \
  @opentelemetry/sdk-node @opentelemetry/resources @opentelemetry/semantic-conventions
```

## 2) Initialize Sentry (first, before anything else)

```ts
// apps/server/src/instrument.ts — import this before any other app code
import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  release: process.env.RAILWAY_GIT_COMMIT_SHA,
  sendDefaultPii: false,

  // Zero users: capture everything now, tune later
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,

  enableLogs: true,
  integrations: [nodeProfilingIntegration()]
})
```

## 3) OpenTelemetry bridge (NodeSDK — lean default)

```ts
// packages/shared/src/telemetry/TelemetryLayer.ts
import { Layer, Effect } from 'effect'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes as SRA } from '@opentelemetry/semantic-conventions'
import { SentrySpanProcessor, SentryPropagator } from '@sentry/opentelemetry'

export const TelemetryLayer = Layer.scoped(
  Effect.acquireRelease(
    Effect.promise(async () => {
      const resource = new Resource({
        [SRA.SERVICE_NAME]: 'credit-system',
        [SRA.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
      })

      const sdk = new NodeSDK({
        resource,
        spanProcessor: new SentrySpanProcessor(),
        textMapPropagator: new SentryPropagator(),
        // Optional: add auto-instrumentations (http, undici, etc.)
        // instrumentations: [getNodeAutoInstrumentations()],
      })

      await sdk.start()
      return sdk
    }),
    (sdk) => Effect.promise(() => sdk.shutdown())
  )
)
```

## 4) Runtime wiring

```ts
// apps/server/src/main.ts
import './instrument' // must be first
import { Effect, Layer } from 'effect'
import { TelemetryLayer } from '@/telemetry/TelemetryLayer'
import { HttpServerLive } from '@/server/HttpServer'
import { LedgerServiceLive } from '@/ledger/LedgerService'

const Runtime = Layer.mergeAll(TelemetryLayer, HttpServerLive, LedgerServiceLive)

Effect.provideLayer(Runtime)(
  Effect.gen(function* () {
    // your app entrypoint
  })
).pipe(Effect.runFork)
```

## 5) Request context (tenant + request tagging)

```ts
// apps/server/src/middleware/SentryMiddleware.ts
import * as Sentry from '@sentry/node'
import { Effect } from 'effect'

export const SentryMiddleware = (app: any) =>
  Effect.gen(function* () {
    const request = yield* /* HttpServerRequest */ Effect.succeed({}) // replace with your request service
    const merchantId = 'derived-from-auth' // implement extraction

    yield* Effect.sync(() => {
      Sentry.withScope((scope) => {
        scope.setTag('merchant_id', merchantId)
        scope.setContext('request', { path: (request as any).url, method: (request as any).method })
      })
    })

    return yield* app
  })
```

## 6) Error capture helper for Effect causes

```ts
// packages/shared/src/telemetry/EffectSentry.ts
import * as Sentry from '@sentry/node'
import { Effect, Cause } from 'effect'

export const withSentryCapture = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  tags?: Record<string, string>
) =>
  effect.pipe(
    Effect.catchAllCause((cause) =>
      Effect.gen(function* () {
        yield* Effect.sync(() => {
          Sentry.withScope((scope) => {
            if (tags) Object.entries(tags).forEach(([k, v]) => scope.setTag(k, v))
            Sentry.captureException(Cause.squash(cause))
          })
        })
        return Effect.failCause(cause)
      }).pipe(Effect.flatten)
    )
  )
```

## 7) Spans in services (use `Effect.fn`, add `withSpan` for hot paths)

```ts
// packages/ledger/src/LedgerService.ts
import { Effect, Layer } from 'effect'
import { withSentryCapture } from '@/telemetry/EffectSentry'
import * as SentryCtx from '@/telemetry/SentryService' // optional helper to set tags

export const LedgerServiceLive = Layer.effect(
  /* LedgerService token */ Symbol.for('LedgerService') as any,
  Effect.gen(function* () {
    const createCreditLot = Effect.fn(
      'ledger.create_credit_lot',
      (merchantId: string, input: { userId: string; credits: number }) =>
        Effect.gen(function* () {
          yield* SentryCtx.setMerchantContext(merchantId)

          const result = yield* Effect.tryPromise(async () => {
            // DB operation here
            return { id: 'lot-id' }
          }).pipe(
            // add rich attributes for the hot path
            Effect.withSpan('ledger.db.create_credit_lot', {
              attributes: { merchant_id: merchantId, user_id: input.userId, credits: input.credits }
            }),
            withSentryCapture({ operation: 'create_credit_lot', merchant_id: merchantId })
          )
          return result
        })
    )

    return { createCreditLot }
  })
)
```

## 8) Environment config (Railway)

```bash
SENTRY_DSN=https://<key>@sentry.io/<project>
SENTRY_ENVIRONMENT=production
NODE_ENV=production
RAILWAY_GIT_COMMIT_SHA=auto-set-by-railway
```

## 9) Sentry search quick refs

```text
merchant_id:acme_corp
merchant_id:[acme_corp, demo_corp]
environment:production merchant_id:acme_corp
operation:purchase_settlement merchant_id:acme_corp
```

## 10) Ops notes (lean defaults)

- Sampling: 100% now; adjust later if needed.
- Privacy: avoid PII in spans; use tags for searchable identifiers, context for details.
- Shutdown: allow Sentry to flush; ensure `NodeSDK.shutdown()` runs on exit.

---

### Appendix A — Manual provider (advanced alternative)

```ts
// packages/shared/src/telemetry/OpenTelemetryLayer.ts
import { Layer, Effect } from 'effect'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes as SRA } from '@opentelemetry/semantic-conventions'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { SentrySpanProcessor, SentryPropagator } from '@sentry/opentelemetry'

export const OpenTelemetryLayer = Layer.scoped(
  Effect.acquireRelease(
    Effect.sync(() => {
      const resource = new Resource({
        [SRA.SERVICE_NAME]: 'credit-system',
        [SRA.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
      })
      const provider = new NodeTracerProvider({ resource })
      provider.addSpanProcessor(new SentrySpanProcessor())
      provider.register({ propagator: new SentryPropagator() })
      registerInstrumentations({ tracerProvider: provider, instrumentations: [] })
      return provider
    }),
    (provider) => Effect.promise(() => provider.shutdown())
  )
)
```

