import { Schema } from "@effect/schema"

// Merchant identifier value object
export const MerchantId = Schema.String.pipe(
  Schema.minLength(1),
  Schema.brand("MerchantId")
)

export type MerchantId = Schema.Schema.Type<typeof MerchantId>
