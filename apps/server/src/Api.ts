import { AdminApiGroup, AdminApiPublicGroup, HealthApi, VersionApiGroup } from "@credit-system/rpc"
import { MerchantContext } from "@credit-system/shared"
import { HttpApiBuilder } from "@effect/platform"
import { Effect, Layer } from "effect"
import { Authorization } from "./middleware/auth/AuthMiddleware.js"
import { AuthorizationLive } from "./middleware/auth/AuthMiddlewareImpl.js"
import { TokenService } from "./TokenService.js"

const getVersionInfo = () =>
  Effect.sync(() => ({
    version: process.env.APP_VERSION || "dev-0.0.0",
    commit: process.env.GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || "dev-local",
    buildTime: process.env.BUILD_TIME || new Date().toISOString(),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || "development"
  }))

// --- 1. Define the final, combined API shape first ---

const CombinedApi = HealthApi
  .add(VersionApiGroup)
  .add(AdminApiPublicGroup)
  .add(AdminApiGroup.middleware(Authorization)) // Apply middleware requirement at the combined API level

// --- 2. Implement handlers for each group, referencing the CombinedApi ---

const HealthApiLive = HttpApiBuilder.group(
  CombinedApi,
  "health",
  (handlers) => handlers.handle("getHealth", () => Effect.succeed({ status: "ok" as const }))
)

const VersionApiLive = HttpApiBuilder.group(
  CombinedApi,
  "version",
  (handlers) => handlers.handle("getVersion", () => getVersionInfo())
)

// --- Implement handlers for the public and protected admin groups ---

const AdminApiPublicLive = HttpApiBuilder.group(
  CombinedApi,
  "admin-public",
  (handlers) =>
    handlers.handle("generateMerchantToken", () =>
      Effect.gen(function*(_) {
        const tokenService = yield* TokenService
        return yield* tokenService.generateMerchantToken()
      }))
)

const AdminApiLive = HttpApiBuilder.group(
  CombinedApi,
  "admin",
  (handlers) =>
    handlers.handle("getMerchantId", () =>
      Effect.gen(function*(_) {
        const merchantContext = yield* MerchantContext
        return { merchantId: merchantContext.merchantId }
      }))
).pipe(
  Layer.provide(AuthorizationLive)
)

// --- 3. Provide all the implementations to the CombinedApi ---

export const ApiLive = HttpApiBuilder.api(CombinedApi).pipe(
  Layer.provide(HealthApiLive),
  Layer.provide(VersionApiLive),
  Layer.provide(AdminApiPublicLive),
  Layer.provide(AdminApiLive)
)
