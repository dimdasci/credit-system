import { Schema } from "effect"

export const JwtClaims = Schema.Struct({
  sub: Schema.String,
  merchant_id: Schema.String,
  aud: Schema.Literal("credit-ledger-api"),
  iat: Schema.Number,
  exp: Schema.Number
})

export type JwtClaims = typeof JwtClaims.Type