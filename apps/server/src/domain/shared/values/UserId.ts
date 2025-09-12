import { Schema } from "effect"

// User identifier value object
export const UserId = Schema.String.pipe(
  Schema.minLength(1),
  Schema.brand("UserId")
)

export type UserId = Schema.Schema.Type<typeof UserId>
