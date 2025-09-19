import type { SqlClient, SqlError } from "@effect/sql"
import type { Effect } from "effect"
import { Context, Schema } from "effect"
import type { ConfigError } from "effect/ConfigError"

export class MissingMerchantDatabaseUrlError extends Schema.TaggedError<MissingMerchantDatabaseUrlError>()(
  "MissingMerchantDatabaseUrlError",
  {
    merchantId: Schema.String,
    envVar: Schema.String
  }
) {}

export interface DatabaseManager {
  readonly getConnection: (
    merchantId: string
  ) => Effect.Effect<
    SqlClient.SqlClient,
    MissingMerchantDatabaseUrlError | ConfigError | SqlError.SqlError
  >
}

export const DatabaseManager = Context.GenericTag<DatabaseManager>("DatabaseManager")
