import { MerchantContext } from "@credit-system/shared"
import { HttpApiMiddleware, HttpApiSchema, HttpApiSecurity } from "@effect/platform"
import { Schema } from "effect"

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  {
    message: Schema.String
  },
  HttpApiSchema.annotations({ status: 401 })
) {}

export class Authorization extends HttpApiMiddleware.Tag<Authorization>()(
  "Authorization",
  {
    failure: Unauthorized,
    provides: MerchantContext,
    security: {
      bearer: HttpApiSecurity.bearer
    }
  }
) {}
