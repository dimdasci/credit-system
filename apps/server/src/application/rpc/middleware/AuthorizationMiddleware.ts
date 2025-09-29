import { JwtClaims, MerchantContext, ServerConfig } from "@credit-system/shared"
import { RpcMiddleware } from "@effect/rpc"
import { Effect, Layer, Redacted, Schema } from "effect"
import jwt from "jsonwebtoken"

export class Authorization extends RpcMiddleware.Tag<Authorization>()(
  "Authorization",
  {
    failure: Schema.String,
    provides: MerchantContext
  }
) {}

const fail = (message: string) => Effect.fail(message)

export const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function*() {
    const config = yield* ServerConfig
    const secret = Redacted.value(config.jwtSecret)

    return Authorization.of(({ headers }) =>
      Effect.gen(function*() {
        const authHeader = headers["authorization"]?.trim()
        if (!authHeader) {
          return yield* fail("Authorization header required")
        }

        const [scheme, token] = authHeader.split(/\s+/, 2)
        if (!scheme || scheme.toLowerCase() !== "bearer") {
          return yield* fail("Authorization header must use Bearer scheme")
        }

        if (!token || token.trim().length === 0) {
          return yield* fail("Bearer token is missing")
        }

        const decoded = yield* Effect.try({
          try: () => jwt.verify(token.trim(), secret, { audience: "credit-ledger-api" }),
          catch: (error) => `Invalid JWT: ${error instanceof Error ? error.message : String(error)}`
        })

        if (typeof decoded === "string") {
          return yield* fail("Invalid JWT: payload must be a JSON object")
        }

        const subject = decoded.sub
        if (typeof subject !== "string" || subject.trim().length === 0) {
          return yield* fail("JWT subject (merchant id) is missing")
        }

        const audience = decoded.aud
        if (typeof audience !== "string") {
          return yield* fail("JWT audience must be a string")
        }

        if (audience !== "credit-ledger-api") {
          return yield* fail("Invalid JWT: unexpected audience")
        }

        const issuedAt = decoded.iat
        if (typeof issuedAt !== "number") {
          return yield* fail("Invalid JWT: issued-at claim missing")
        }

        const claims = yield* Effect.try({
          try: () =>
            JwtClaims.make({
              sub: subject,
              aud: "credit-ledger-api",
              iat: issuedAt,
              exp: typeof decoded.exp === "number" ? decoded.exp : null
            }),
          catch: (error) => `Invalid JWT claims: ${error instanceof Error ? error.message : String(error)}`
        })

        return { merchantId: claims.sub }
      })
    )
  })
)
