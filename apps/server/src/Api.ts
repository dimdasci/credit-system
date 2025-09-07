import { HealthApi, VersionApiGroup } from "@credit-system/rpc"
import { HttpApiBuilder } from "@effect/platform"
import { Effect, Layer } from "effect"
import packageInfo from "../package.json" with { type: "json" }

const getVersionInfo = () => Effect.sync(() => ({
  version: process.env.APP_VERSION || packageInfo.version,
  commit: process.env.GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || "dev-local",
  buildTime: process.env.BUILD_TIME || new Date().toISOString(),
  nodeVersion: process.version,
  environment: process.env.NODE_ENV || "development"
}))

const HealthApiLive = HttpApiBuilder.group(
  HealthApi,
  "health",
  (handlers) => handlers.handle("getHealth", () => Effect.succeed({ status: "ok" as const }))
)

const VersionApiLive = HttpApiBuilder.group(
  HealthApi.add(VersionApiGroup),
  "version", 
  (handlers) => handlers.handle("getVersion", () => getVersionInfo())
)

const CombinedApi = HealthApi.add(VersionApiGroup)

export const ApiLive = HttpApiBuilder.api(CombinedApi).pipe(
  Layer.provide(HealthApiLive),
  Layer.provide(VersionApiLive)
)
