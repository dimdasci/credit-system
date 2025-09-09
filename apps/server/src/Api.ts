import { AdminApiGroup, HealthApi, VersionApiGroup } from "@credit-system/rpc"
import { JwtClaims, ServerConfig } from "@credit-system/shared"
import { HttpApi, HttpApiBuilder, HttpServerRequest } from "@effect/platform"
import { Effect, Layer, Redacted, Schema } from "effect"
import jwt from "jsonwebtoken"
import { TokenService } from "./TokenService.js"

const getVersionInfo = () =>
  Effect.sync(() => ({
    // Version should come from git tags injected via APP_VERSION
    // Fallback for local/dev when no tag is present
    version: process.env.APP_VERSION || "dev-0.0.0",
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
  HttpApi.make("api").add(VersionApiGroup),
  "version",
  (handlers) => handlers.handle("getVersion", () => getVersionInfo())
)

const validateJwtAndExtractMerchantId = () =>
  Effect.gen(function*(_) {
    const request = yield* _(HttpServerRequest.HttpServerRequest)
    const config = yield* _(ServerConfig)
    
    // Extract Bearer token
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return yield* _(Effect.fail(new Error("Authorization header required")))
    }
    
    const token = authHeader.substring(7)
    const secretValue = Redacted.value(config.jwtSecret)
    
    // Verify JWT (jwt.verify is synchronous, not a promise)
    const decoded = yield* _(
      Effect.try(() => jwt.verify(token, secretValue) as unknown).pipe(
        Effect.catchAll((error) => Effect.fail(new Error(`Invalid JWT: ${error}`)))
      )
    )
    
    // Validate JWT structure  
    const claims = yield* _(
      Schema.decodeUnknown(JwtClaims)(decoded).pipe(
        Effect.catchAll((error) => Effect.fail(new Error(`Invalid JWT structure: ${error}`)))
      )
    )
    
    return claims.merchant_id
  })

const AdminApiLive = HttpApiBuilder.group(
  HttpApi.make("api").add(AdminApiGroup),
  "admin",
  (handlers) =>
    handlers
      .handle("generateMerchantToken", () =>
        Effect.gen(function*() {
          const tokenService = yield* TokenService
          return yield* tokenService.generateMerchantToken()
        }))
      .handle("getMerchantId", () =>
        Effect.gen(function*(_) {
          const merchantId = yield* _(validateJwtAndExtractMerchantId())
          return { merchantId }
        }))
)

const CombinedApi = HealthApi.add(VersionApiGroup).add(AdminApiGroup)

export const ApiLive = HttpApiBuilder.api(CombinedApi).pipe(
  Layer.provide(HealthApiLive),
  Layer.provide(VersionApiLive), 
  Layer.provide(AdminApiLive)
)
