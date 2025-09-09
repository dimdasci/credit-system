import { Schema } from "effect"

export const JwtClaims = Schema.Struct({
  sub: Schema.String,
  aud: Schema.Literal("credit-ledger-api"),
  iat: Schema.Number,
  exp: Schema.optional(Schema.Union(Schema.Number, Schema.Null))
})

export type JwtClaims = typeof JwtClaims.Type
