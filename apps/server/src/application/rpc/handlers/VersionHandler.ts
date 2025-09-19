import { VersionRpcs } from "@credit-system/rpc"
import { Effect } from "effect"

const getVersionInfo = () =>
  Effect.sync(() => ({
    version: process.env.APP_VERSION || "dev-0.1.0",
    commit: process.env.GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || "dev-local",
    buildTime: process.env.BUILD_TIME || new Date().toISOString(),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || "development"
  }))

export const VersionHandlers = VersionRpcs.toLayer({
  getVersion: () => getVersionInfo()
})
