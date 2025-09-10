import type { SqlError } from "@effect/sql"
import { Effect, Layer, pipe } from "effect"
import type { ConfigError } from "effect/ConfigError"
// no file IO needed currently
import { DatabaseManager, type MissingMerchantDatabaseUrlError } from "./DatabaseManager.js"
import type { SchemaValidationError } from "./SchemaManager.js"
import { SchemaInitializationError, SchemaManager } from "./SchemaManager.js"

// schema files path not used currently

// Required tables for validation
const REQUIRED_TABLES = [
  "products",
  "ledger_entries"
] as const

export const SchemaManagerLive = Layer.effect(
  SchemaManager,
  Effect.gen(function*(_) {
    const databaseManager = yield* _(DatabaseManager)

    // Schema files loading was previously used; removed to avoid unused code warnings

    return SchemaManager.of({
      initializeSchema: (
        merchantId: string
      ): Effect.Effect<
        void,
        SchemaInitializationError | MissingMerchantDatabaseUrlError | ConfigError | SqlError.SqlError
      > =>
        pipe(
          Effect.gen(function*() {
            // Get the SqlClient service
            const sqlClient = yield* databaseManager.getConnection(merchantId)

            // Create basic tables for minimal schema
            yield* sqlClient`
              CREATE TABLE IF NOT EXISTS products (
                product_code text PRIMARY KEY,
                title text NOT NULL,
                credits integer NOT NULL CHECK (credits > 0),
                access_period_days integer NOT NULL CHECK (access_period_days > 0),
                distribution text NOT NULL CHECK (distribution IN ('sellable', 'grant')),
                effective_at timestamptz NOT NULL DEFAULT now(),
                archived_at timestamptz
              )
            `

            yield* sqlClient`
              CREATE TABLE IF NOT EXISTS ledger_entries (
                entry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id text NOT NULL,
                lot_id uuid,
                amount integer NOT NULL,
                reason text NOT NULL,
                operation_type text NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now()
              )
            `
            // Enable extensions
            yield* sqlClient`CREATE EXTENSION IF NOT EXISTS pgcrypto`
          }),
          Effect.catchTags({
            // Convert SQL errors to a domain-specific initialization error
            SqlError: (err) =>
              Effect.fail(
                new SchemaInitializationError({ merchantId, cause: err.message })
              )
          }),
          Effect.asVoid
        ),

      validateSchema: (
        merchantId: string
      ): Effect.Effect<
        boolean,
        SchemaValidationError | MissingMerchantDatabaseUrlError | ConfigError | SqlError.SqlError
      > =>
        Effect.gen(function*() {
          // Get the SqlClient service
          const sqlClient = yield* databaseManager.getConnection(merchantId)

          const missingTables: Array<string> = []

          // Check each required table exists
          for (const tableName of REQUIRED_TABLES) {
            const result = yield* sqlClient<{ count: string }>`
              SELECT COUNT(*) as count
              FROM information_schema.tables 
              WHERE table_name = ${tableName}
              AND table_schema = current_schema()
            `

            const count = parseInt(result[0]?.count ?? "0")
            if (count === 0) {
              missingTables.push(tableName)
            }
          }

          return missingTables.length === 0
        })
    })
  })
)
