import { AdminPublicRpcs, AdminRpcs } from "@credit-system/rpc"
import { JwtClaims, ServerConfig } from "@credit-system/shared"
import { TokenService } from "@server/services/business/TokenService.js"
import { Effect, Redacted } from "effect"
import jwt from "jsonwebtoken"

export const AdminPublicHandlers = AdminPublicRpcs.toLayer({
  generateMerchantToken: () =>
    Effect.gen(function*() {
      const tokenService = yield* TokenService
      return yield* tokenService.generateMerchantToken()
    })
})

export const AdminHandlers = AdminRpcs.toLayer({
  getMerchantId: (_input, { headers }) =>
    Effect.gen(function*() {
      const config = yield* ServerConfig.pipe(
        Effect.mapError(() => "Server configuration is unavailable" as const)
      )

      const authorization = headers["authorization"]?.trim() ?? ""
      if (authorization.length === 0) {
        return yield* Effect.fail("Authorization header required" as const)
      }

      const [scheme, token] = authorization.split(/\s+/, 2)
      if (!scheme || scheme.toLowerCase() !== "bearer") {
        return yield* Effect.fail("Authorization header must use Bearer scheme" as const)
      }

      if (!token || token.trim().length === 0) {
        return yield* Effect.fail("Bearer token is missing" as const)
      }

      const secret = Redacted.value(config.jwtSecret)
      const decoded = yield* Effect.try({
        try: () => jwt.verify(token.trim(), secret, { audience: "credit-ledger-api" }),
        catch: (error) => "Invalid JWT: " + (error instanceof Error ? error.message : String(error))
      })

      if (typeof decoded === "string") {
        return yield* Effect.fail("Invalid JWT: payload must be a JSON object" as const)
      }

      const subject = decoded.sub
      if (typeof subject !== "string") {
        return yield* Effect.fail("Invalid JWT claims: subject is missing" as const)
      }

      const audience = decoded.aud
      if (typeof audience !== "string") {
        return yield* Effect.fail("Invalid JWT claims: audience must be a string" as const)
      }

      if (audience !== "credit-ledger-api") {
        return yield* Effect.fail("Invalid JWT claims: unexpected audience" as const)
      }

      const issuedAt = decoded.iat
      if (typeof issuedAt !== "number") {
        return yield* Effect.fail("Invalid JWT claims: issued-at is missing" as const)
      }

      const claims = yield* Effect.try({
        try: () =>
          JwtClaims.make({
            sub: subject,
            aud: "credit-ledger-api",
            iat: issuedAt,
            exp: decoded.exp ?? null
          }),
        catch: (error) => "Invalid JWT claims: " + (error instanceof Error ? error.message : String(error))
      })

      const merchantId = claims.sub.trim()
      if (merchantId.length === 0) {
        return yield* Effect.fail("JWT subject (merchant id) is empty" as const)
      }

      return { merchantId }
    })
})
