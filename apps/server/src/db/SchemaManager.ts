import type { SqlError } from "@effect/sql"
import type { Effect } from "effect"
import { Context, Schema } from "effect"
import type { ConfigError } from "effect/ConfigError"
import type { MissingMerchantDatabaseUrlError } from "./DatabaseManager.js"

export class SchemaInitializationError extends Schema.TaggedError<SchemaInitializationError>()(
  "SchemaInitializationError",
  {
    merchantId: Schema.String,
    cause: Schema.String
  }
) {}

export class SchemaValidationError extends Schema.TaggedError<SchemaValidationError>()(
  "SchemaValidationError",
  {
    merchantId: Schema.String,
    missingTables: Schema.Array(Schema.String)
  }
) {}

export interface SchemaManager {
  readonly initializeSchema: (
    merchantId: string
  ) => Effect.Effect<
    void,
    SchemaInitializationError | MissingMerchantDatabaseUrlError | ConfigError | SqlError.SqlError
  >

  readonly validateSchema: (
    merchantId: string
  ) => Effect.Effect<
    boolean,
    SchemaValidationError | MissingMerchantDatabaseUrlError | ConfigError | SqlError.SqlError
  >
}

export const SchemaManager = Context.GenericTag<SchemaManager>("SchemaManager")
