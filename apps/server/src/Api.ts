import { HealthApi } from "@credit-system/rpc"
import { HttpApiBuilder } from "@effect/platform"
import { Effect, Layer } from "effect"

const HealthApiLive = HttpApiBuilder.group(
  HealthApi,
  "health",
  (handlers) => handlers.handle("getHealth", () => Effect.succeed({ status: "ok" as const }))
)

export const ApiLive = HttpApiBuilder.api(HealthApi).pipe(
  Layer.provide(HealthApiLive)
)
