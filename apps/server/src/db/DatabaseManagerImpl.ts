import { SqlClient } from "@effect/sql"
import type { SqlError } from "@effect/sql"
import { PgClient } from "@effect/sql-pg"
import { Config, Context, Effect, Layer, Option } from "effect"
import type { ConfigError } from "effect/ConfigError"
import type { Redacted } from "effect/Redacted"
import { types as pgTypes } from "pg"
import { DatabaseManager, MissingMerchantDatabaseUrlError } from "./DatabaseManager.js"

// Configure pg (node-postgres) type parsers so encoded values match our schemas
// - 1184 timestamptz: keep ISO string as-is
// - 1114 timestamp (without time zone): assume UTC and append 'Z' to make it ISO
// - 1082 date: keep plain YYYY-MM-DD string
// Note: This is app-level configuration (client-side), not a DB migration.
pgTypes.setTypeParser(1184, (s: string) => s)
pgTypes.setTypeParser(1114, (s: string) => `${s}Z`)
pgTypes.setTypeParser(1082, (s: string) => s)

export interface PgLayerFactory {
  readonly make: (
    url: Redacted<string>
  ) => Layer.Layer<SqlClient.SqlClient, SqlError.SqlError | ConfigError, never>
}
export const PgLayerFactory = Context.GenericTag<PgLayerFactory>("PgLayerFactory")

export const PgLayerFactoryLive = Layer.succeed(
  PgLayerFactory,
  PgLayerFactory.of({ make: (url) => PgClient.layer({ url }) })
)

export const DatabaseManagerLive = Layer.effect(
  DatabaseManager,
  Effect.gen(function*() {
    const factory = yield* PgLayerFactory
    const poolMap = new Map<string, Layer.Layer<SqlClient.SqlClient, SqlError.SqlError | ConfigError, never>>()

    return DatabaseManager.of({
      getConnection: (
        merchantId: string
      ): Effect.Effect<SqlClient.SqlClient, MissingMerchantDatabaseUrlError | ConfigError | SqlError.SqlError> =>
        Effect.gen(function*(_) {
          const prefix = merchantId.substring(0, 4).toUpperCase()

          if (poolMap.has(prefix)) {
            const pool = poolMap.get(prefix)!
            return yield* _(Effect.provide(SqlClient.SqlClient, pool))
          }

          const envVar = `MERCHANT_${prefix}_DATABASE_URL`
          const dbUrlConfig = Config.redacted(envVar)

          const dbUrl = yield* _(
            Config.option(dbUrlConfig),
            Effect.flatMap(Option.match({
              onNone: () => Effect.fail(new MissingMerchantDatabaseUrlError({ merchantId, envVar })),
              onSome: (url) => Effect.succeed(url)
            }))
          )

          const newPool = factory.make(dbUrl)
          poolMap.set(prefix, newPool)

          return yield* _(Effect.provide(SqlClient.SqlClient, newPool))
        })
    })
  })
)
