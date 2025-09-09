import { ServerConfig } from "../config/index.js"
import { HttpMiddleware, HttpServerRequest } from "@effect/platform"
import { Effect, Redacted, Schema } from "effect"
import jwt from "jsonwebtoken"
import { JwtClaims } from "./JwtTypes.js"
import { MerchantContext } from "./MerchantContext.js"

export class AuthenticationRequiredError extends Schema.TaggedError<AuthenticationRequiredError>()(
  "AuthenticationRequired",
  { message: Schema.Literal("Authorization header is required") }
) {}

export class InvalidJwtError extends Schema.TaggedError<InvalidJwtError>()(
  "InvalidJwt", 
  { reason: Schema.String }
) {}

export class MissingMerchantIdError extends Schema.TaggedError<MissingMerchantIdError>()(
  "MissingMerchantId",
  { message: Schema.Literal("JWT must contain merchant_id claim") }
) {}

const extractToken = (request: HttpServerRequest.HttpServerRequest): Effect.Effect<string, AuthenticationRequiredError> =>
  Effect.gen(function* (_) {
    const authHeader = request.headers.authorization
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      yield* _(Effect.fail(new AuthenticationRequiredError()))
    }
    
    return authHeader.substring(7) // Remove "Bearer "
  })

const verifyAndDecodeJwt = (token: string, secret: string): Effect.Effect<JwtClaims, InvalidJwtError> =>
  Effect.gen(function* (_) {
    const decoded = yield* _(
      Effect.tryPromise({
        try: () => jwt.verify(token, secret) as unknown,
        catch: (error) => new InvalidJwtError({ reason: String(error) })
      })
    )
    
    // Validate the JWT payload matches our schema
    return yield* _(Schema.decodeUnknown(JwtClaims)(decoded).pipe(
      Effect.catchAll((error) => 
        Effect.fail(new InvalidJwtError({ reason: `Invalid JWT structure: ${error}` }))
      )
    ))
  })

export const JwtAuthMiddleware = HttpMiddleware.make((app) =>
  Effect.gen(function* (_) {
    const request = yield* _(HttpServerRequest.HttpServerRequest)
    const config = yield* _(ServerConfig)
    
    // Extract and verify JWT token
    const token = yield* _(extractToken(request))
    const secretValue = Redacted.value(config.jwtSecret)
    const claims = yield* _(verifyAndDecodeJwt(token, secretValue))
    
    // Validate merchant_id is present
    if (!claims.merchant_id) {
      yield* _(Effect.fail(new MissingMerchantIdError()))
    }
    
    // Create merchant context
    const merchantContext: MerchantContext = {
      merchantId: claims.merchant_id,
      serviceAccountId: claims.sub
    }
    
    // Execute the rest of the request pipeline with merchant context
    return yield* _(
      app.pipe(
        Effect.provideService(MerchantContext, merchantContext)
      )
    )
  })
)