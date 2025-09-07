import { HealthApi, VersionApiGroup } from "@credit-system/rpc"
import { HttpApiBuilder } from "@effect/platform"
import { Effect, Layer } from "effect"
import packageInfo from "../package.json" with { type: "json" }

const getVersionInfo = () => Effect.sync(() => {
  let commit = process.env.RAILWAY_GIT_COMMIT_SHA || "unknown"
  
  // Try to get git commit hash if in development
  if (commit === "unknown" && process.env.NODE_ENV === "development") {
    try {
      const { execSync } = require('child_process')
      commit = execSync('git rev-parse --short HEAD').toString().trim()
    } catch {
      // Fallback to unknown if git command fails
      commit = "unknown"
    }
  }
  
  return {
    version: packageInfo.version,
    commit,
    buildTime: new Date().toISOString(),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || "development"
  }
})

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
