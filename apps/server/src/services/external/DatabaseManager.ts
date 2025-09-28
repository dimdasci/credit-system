import type { SqlClient, SqlError } from "@effect/sql"
import type { ServiceUnavailable } from "@server/domain/shared/DomainErrors.js"
import type { Effect } from "effect"
import { Context } from "effect"
import type { ConfigError } from "effect/ConfigError"

export interface DatabaseManager {
  readonly getConnection: (
    merchantId: string
  ) => Effect.Effect<
    SqlClient.SqlClient,
    ServiceUnavailable | ConfigError | SqlError.SqlError
  >
}

export const DatabaseManager = Context.GenericTag<DatabaseManager>("DatabaseManager")
