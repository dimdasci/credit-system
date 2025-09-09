import { JwtClaims, ServerConfig } from "@credit-system/shared"
import { Effect, Layer, Redacted, Schema } from "effect"
import jwt from "jsonwebtoken"
import { Authorization, Unauthorized } from "./AuthMiddleware.js"

export const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function*() {
    const config = yield* ServerConfig

    yield* Effect.log("Creating Authorization middleware")

    // Return the security handlers for the middleware
    return {
      // Define the handler for the Bearer token
      bearer: (bearerToken) =>
        Effect.gen(function*() {
          const token = Redacted.value(bearerToken)
          const secretValue = Redacted.value(config.jwtSecret)

          yield* Effect.log("Validating bearer token")

          // Verify JWT (jwt.verify is synchronous)
          const decoded = yield* Effect.try({
            try: () => jwt.verify(token, secretValue) as unknown,
            catch: (error) => {
              // Extract message from the error object, whether it's a standard Error or something else
              const message = error instanceof Error ? error.message : String(error)
              return new Unauthorized({
                message: `Invalid JWT: ${message}`
              })
            }
          })

          // Validate JWT structure against schema
          const claims = yield* Schema.decodeUnknown(JwtClaims)(decoded).pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new Unauthorized({
                  message: `Invalid JWT structure: ${error}`
                })
              )
            )
          )

          // Validate subject (merchant id) is present
          if (!claims.sub) {
            const unauthorizedError = Unauthorized.make({
              message: "JWT must contain sub claim (merchant id)"
            })
            return yield* Effect.fail(unauthorizedError)
          }

          // Return the MerchantContext data
          return {
            merchantId: claims.sub
          }
        })
    }
  })
)
