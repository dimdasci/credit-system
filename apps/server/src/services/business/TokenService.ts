import { ServerConfig } from "@credit-system/shared"
import { Context, Effect, Layer, Redacted } from "effect"
import jwt from "jsonwebtoken"
import { randomUUID } from "node:crypto"

export interface TokenService {
  readonly generateMerchantToken: () => Effect.Effect<{ merchantId: string; token: string }>
}

export const TokenService = Context.GenericTag<TokenService>("TokenService")

export const TokenServiceLive = Layer.scoped(
  TokenService,
  Effect.gen(function*() {
    const config = yield* ServerConfig

    return {
      generateMerchantToken: () =>
        Effect.sync(() => {
          const merchantId = randomUUID()
          const secretValue = Redacted.value(config.jwtSecret)

          const token = jwt.sign(
            {
              sub: merchantId,
              aud: "credit-ledger-api",
              iat: Math.floor(Date.now() / 1000)
            },
            secretValue
          )

          return { merchantId, token }
        })
    }
  })
)
