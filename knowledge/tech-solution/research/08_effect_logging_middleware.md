# Adding Logging Middleware in Effect.js Applications

This document provides guidance on how to implement logging middleware in Effect.js applications, specifically for HTTP APIs created with `@effect/platform`. The implementation follows the official documentation patterns for type-safe middleware integration.

## Table of Contents

- [Adding Logging Middleware in Effect.js Platform]
  - [Table of Contents]
  - [Introduction](#introduction)
  - [Defining Logging Middleware](#defining-logging-middleware)
  - [Implementing the Middleware](#implementing-the-middleware)
  - [Applying Middleware to API Components](#applying-middleware-to-api-components)
    - [1. Endpoint Level](#1-endpoint-level)
    - [2. Group Level](#2-group-level)
    - [3. API Level](#3-api-level)
    - [4. Providing the Implementation](#4-providing-the-implementation)
  - [Advanced Logging Patterns](#advanced-logging-patterns)
    - [Structured Logging](#structured-logging)
    - [Conditional Logging](#conditional-logging)
    - [Response Logging](#response-logging)
  - [Documentation References](#documentation-references)
  - [Complete Example](#complete-example)
  - [Effect internal logger](#effect-internal-logger)

## Introduction

Logging middleware in Effect.js allows you to capture and log information about HTTP requests and responses in a structured way. The middleware approach enables you to:

- Track request and response details
- Measure response times
- Structure logs in a consistent format
- Apply logging selectively to different parts of your API

The `@effect/platform` library provides a middleware system designed for this purpose, allowing you to define, implement, and apply middleware in a type-safe manner.

## Defining Logging Middleware

The first step is to define the middleware by extending the `HttpApiMiddleware.Tag` class. This creates a service tag that can be used to identify and provide the middleware implementation.

```typescript
import { HttpApiMiddleware } from "@effect/platform"
import { Schema } from "effect"

// Define a schema for errors that might be returned by the logger middleware
export class LoggerError extends Schema.TaggedError<LoggerError>()(
  "LoggerError",
  {}
) {}

// Define the logger middleware tag
export class Logger extends HttpApiMiddleware.Tag<Logger>()("Http/Logger", {
  // Define the error schema for the middleware
  failure: LoggerError
}) {}
```

In this example:
- `LoggerError` defines a schema for errors that might be returned by the middleware
- `Logger` extends `HttpApiMiddleware.Tag` to create a tag for the middleware
- The middleware is identified by the string "Http/Logger"
- The `failure` option specifies the error schema

## Implementing the Middleware

After defining the middleware tag, you need to provide an implementation using the `Layer.effect` function. The implementation should return an effect that logs information about the request.

```typescript
import { HttpServerRequest } from "@effect/platform"
import { Effect, Layer } from "effect"
import { Logger } from "./middleware"

// Create the logger middleware implementation
const LoggerLive = Layer.effect(
  Logger,
  Effect.gen(function*() {
    yield* Effect.log("Creating logger middleware")

    // Return the middleware implementation
    return Effect.gen(function*() {
      // Access the request context
      const request = yield* HttpServerRequest.HttpServerRequest
      const startTime = Date.now()

      // Log the request details
      yield* Effect.log(`Request: ${request.method} ${request.url} - Start`)

      // Return a cleanup effect that will log completion
      return Effect.sync(() => {
        const duration = Date.now() - startTime
        console.log(`Request: ${request.method} ${request.url} - Completed (${duration}ms)`)
      })
    })
  })
)
```

This implementation:
1. Accesses the `HttpServerRequest` to get request details
2. Records the start time of the request
3. Logs the request details when processing begins
4. Returns a cleanup effect that logs completion information, including the duration

## Applying Middleware to API Components

You can apply middleware at different levels of your API structure:

### 1. Endpoint Level

To apply middleware to a specific endpoint:

```typescript
import { HttpApiEndpoint } from "@effect/platform"
import { Schema } from "effect"
import { Logger } from "./middleware"

const Health = Schema.Struct({ status: Schema.Literal("ok") })

// Apply middleware to a specific endpoint
const healthEndpoint = HttpApiEndpoint.get("getHealth", "/health")
  .addSuccess(Health)
  .middleware(Logger)
```

### 2. Group Level

To apply middleware to all endpoints in a group:

```typescript
import { HttpApiGroup } from "@effect/platform"
import { Logger } from "./middleware"

// Apply middleware to all endpoints in the group
const HealthApiGroup = HttpApiGroup.make("health")
  .add(healthEndpoint)
  .middleware(Logger)
```

### 3. API Level

To apply middleware to the entire API:

```typescript
import { HttpApi } from "@effect/platform"
import { Logger } from "./middleware"

// Apply middleware to the entire API
const HealthApi = HttpApi.make("api")
  .add(HealthApiGroup)
  .middleware(Logger)
```

### 4. Providing the Implementation

When implementing API groups, you need to provide the middleware implementation:

```typescript
import { HttpApiBuilder } from "@effect/platform"
import { Effect, Layer } from "effect"

// Implement the health group and provide the logger middleware
const HealthApiLive = HttpApiBuilder.group(
  HealthApi,
  "health",
  (handlers) => handlers.handle("getHealth", () => Effect.succeed({ status: "ok" as const }))
).pipe(
  // Provide the middleware implementation
  Layer.provide(LoggerLive)
)
```

## Advanced Logging Patterns

### Structured Logging

For more advanced logging, you can create structured log entries with metadata:

```typescript
import { Effect } from "effect"

// Log with structured metadata
yield* Effect.logAnnotate(
  Effect.log(`Request: ${request.method} ${request.url}`),
  {
    requestId: request.headers["x-request-id"] || "unknown",
    method: request.method,
    path: request.url,
    clientIp: request.remoteAddress || "unknown"
  }
)
```

### Conditional Logging

You might want to disable logging for certain paths (like health checks):

```typescript
import { Effect } from "effect"

// Skip detailed logging for health checks
if (!request.url.includes("/health")) {
  yield* Effect.log(`Detailed log for: ${request.url}`)
}
```

### Response Logging

To log response details, you can enhance the middleware to capture and log response information:

```typescript
import { Effect } from "effect"

// In your middleware implementation
return Effect.gen(function*() {
  // This will be executed after the response is generated but before it's sent
  const responseStatus = yield* Effect.map(
    HttpServerResponse.HttpServerResponse,
    response => response.status
  )
  
  yield* Effect.log(`Response status: ${responseStatus}`)
})
```

## Documentation References

The implementation patterns in this guide are based on the official Effect.js documentation:

1. **HTTP API Middleware** - Official documentation for defining and implementing middleware in `@effect/platform`:
   @knowledge/tech-solution/research/09_effect_platform.md, lines 1287:1641

2. **Logger Module** - Effect's built-in logging system:
   https://effect.website/docs/observability/logging

3. **HTTP Server Request** - Documentation for working with HTTP requests:
   @knowledge/tech-solution/research/09_effect_platform.md, lines 4242:4274

4. **Layer Module** - Documentation for Effect's Layer system used to provide middleware:
   https://effect.website/docs/guides/context-management/layers

## Complete Example

Here's a complete example showing middleware definition, implementation, and application:

```typescript
// middleware.ts
import { HttpApiMiddleware } from "@effect/platform"
import { Schema } from "effect"

export class LoggerError extends Schema.TaggedError<LoggerError>()(
  "LoggerError",
  {}
) {}

export class Logger extends HttpApiMiddleware.Tag<Logger>()("Http/Logger", {
  failure: LoggerError
}) {}
```

```typescript
// api.ts
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup, HttpServerRequest } from "@effect/platform"
import { Effect, Layer, Schema } from "effect"
import { Logger } from "./middleware"

// Define schemas
const Health = Schema.Struct({ status: Schema.Literal("ok") })

// Define endpoints
const healthEndpoint = HttpApiEndpoint.get("getHealth", "/health")
  .addSuccess(Health)

// Create API group
const HealthApiGroup = HttpApiGroup.make("health")
  .add(healthEndpoint)
  .middleware(Logger)

// Create API
const HealthApi = HttpApi.make("api")
  .add(HealthApiGroup)

// Implement logger middleware
const LoggerLive = Layer.effect(
  Logger,
  Effect.gen(function*() {
    yield* Effect.log("Creating logger middleware")

    return Effect.gen(function*() {
      const request = yield* HttpServerRequest.HttpServerRequest
      const startTime = Date.now()

      yield* Effect.log(`Request: ${request.method} ${request.url} - Start`)

      return Effect.sync(() => {
        const duration = Date.now() - startTime
        console.log(`Request: ${request.method} ${request.url} - Completed (${duration}ms)`)
      })
    })
  })
)

// Implement API group
const HealthApiLive = HttpApiBuilder.group(
  HealthApi,
  "health",
  (handlers) => handlers.handle("getHealth", () => Effect.succeed({ status: "ok" as const }))
).pipe(
  Layer.provide(LoggerLive)
)

// Create the complete API implementation
export const ApiLive = HttpApiBuilder.api(HealthApi).pipe(
  Layer.provide(HealthApiLive)
)
```

## Effect internal logger

The `HttpMiddleware.logger` middleware enables logging for your entire application, providing insights into each request and response. Here's how to set it up:

```ts
import {
  HttpMiddleware,
  HttpRouter,
  HttpServer,
  HttpServerResponse
} from "@effect/platform"
import { listen } from "./listen.js"

const router = HttpRouter.empty.pipe(
  HttpRouter.get("/", HttpServerResponse.text("Hello World"))
)

// Apply the logger middleware globally
const app = router.pipe(HttpServer.serve(HttpMiddleware.logger))

listen(app, 3000)
/*
curl -i http://localhost:3000
timestamp=... level=INFO fiber=#0 message="Listening on http://0.0.0.0:3000"
timestamp=... level=INFO fiber=#19 message="Sent HTTP response" http.span.1=8ms http.status=200 http.method=GET http.url=/
timestamp=... level=INFO fiber=#20 cause="RouteNotFound: GET /favicon.ico not found
    at ...
    at http.server GET" http.span.2=4ms http.status=500 http.method=GET http.url=/favicon.ico
*/
```

To disable the logger for specific routes, you can use `HttpMiddleware.withLoggerDisabled`:

```ts
import {
  HttpMiddleware,
  HttpRouter,
  HttpServer,
  HttpServerResponse
} from "@effect/platform"
import { listen } from "./listen.js"

// Create the router with routes that will and will not have logging
const router = HttpRouter.empty.pipe(
  HttpRouter.get("/", HttpServerResponse.text("Hello World")),
  HttpRouter.get(
    "/no-logger",
    HttpServerResponse.text("no-logger").pipe(HttpMiddleware.withLoggerDisabled)
  )
)

// Apply the logger middleware globally
const app = router.pipe(HttpServer.serve(HttpMiddleware.logger))

listen(app, 3000)
/*
curl -i http://localhost:3000/no-logger
timestamp=2024-05-19T09:53:29.877Z level=INFO fiber=#0 message="Listening on http://0.0.0.0:3000"
*/
```

Source code of `HttpMiddleware.logger`:

```typescript
/** @internal */
export const logger = make((httpApp) => {
  let counter = 0
  return Effect.withFiberRuntime((fiber) => {
    const request = Context.unsafeGet(fiber.currentContext, ServerRequest.HttpServerRequest)
    return Effect.withLogSpan(
      Effect.flatMap(Effect.exit(httpApp), (exit) => {
        if (fiber.getFiberRef(loggerDisabled)) {
          return exit
        } else if (exit._tag === "Failure") {
          const [response, cause] = ServerError.causeResponseStripped(exit.cause)
          return Effect.zipRight(
            Effect.annotateLogs(Effect.log(cause._tag === "Some" ? cause.value : "Sent HTTP Response"), {
              "http.method": request.method,
              "http.url": request.url,
              "http.status": response.status
            }),
            exit
          )
        }
        return Effect.zipRight(
          Effect.annotateLogs(Effect.log("Sent HTTP response"), {
            "http.method": request.method,
            "http.url": request.url,
            "http.status": exit.value.status
          }),
          exit
        )
      }),
      `http.span.${++counter}`
    )
  })
})
```

Located in `node_modules/.pnpm/@effect+platform@0.90.7_effect@3.17.13/node_modules/@effect/platform/src/internal/httpMiddleware.ts` file.
