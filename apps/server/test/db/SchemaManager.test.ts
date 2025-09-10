import { SqlClient } from "@effect/sql"
import type { SqlError } from "@effect/sql"
import { Cause, ConfigProvider, Effect, Exit, Layer, Option } from "effect"
import { describe, expect, it, vi } from "vitest"
import { MissingMerchantDatabaseUrlError } from "../../src/db/DatabaseManager.js"
import { DatabaseManagerLive, PgLayerFactory } from "../../src/db/DatabaseManagerImpl.js"
import { SchemaInitializationError, SchemaManager } from "../../src/db/SchemaManager.js"
import { SchemaManagerLive } from "../../src/db/SchemaManagerImpl.js"

const testConfigProvider = ConfigProvider.fromMap(
  new Map([
    ["MERCHANT_ABCD_DATABASE_URL", "postgres://test:test@localhost:5432/abcd"],
    ["MERCHANT_WXYZ_DATABASE_URL", "postgres://test:test@localhost:5432/wxyz"]
  ])
)

const makeTestFactory = () => {
  // Mock SQL template literal function that returns Effect
  const mockSql = vi.fn().mockReturnValue(Effect.succeed([]))
  Object.assign(mockSql, {
    safe: vi.fn(),
    withoutTransforms: vi.fn()
  })

  const mockLayer = Layer.succeed(
    SqlClient.SqlClient,
    mockSql as unknown as SqlClient.SqlClient
  )

  const factory = {
    make: vi.fn((_) => mockLayer)
  }

  const layer = Layer.succeed(PgLayerFactory, factory)
  return { factory, layer, mockSql }
}

const makeTestLayers = () => {
  const { factory, layer: testFactoryLayer, mockSql } = makeTestFactory()
  const dbManagerLayer = Layer.provide(DatabaseManagerLive, testFactoryLayer)
  const schemaManagerLayer = Layer.provide(SchemaManagerLive, dbManagerLayer)

  return { factory, testFactoryLayer, dbManagerLayer, schemaManagerLayer, mockSql }
}

describe("SchemaManager", () => {
  describe("initializeSchema", () => {
    it("successfully initializes schema for a valid merchant ID", () => {
      const { mockSql, schemaManagerLayer } = makeTestLayers()

      // Mock successful SQL execution
      mockSql.mockReturnValue(Effect.succeed([]))

      const program = Effect.gen(function*(_) {
        const schemaManager = yield* _(SchemaManager)
        return yield* _(schemaManager.initializeSchema("abcd-1234"))
      })

      const runnable = Effect.provide(program, schemaManagerLayer).pipe(
        Effect.provide(Layer.setConfigProvider(testConfigProvider))
      )

      Effect.runSync(runnable)

      // Should execute schema initialization SQL
      expect(mockSql).toHaveBeenCalledTimes(3) // init.sql + functions.sql + partitions
    })

    it("is idempotent - running twice doesn't fail", () => {
      const { mockSql, schemaManagerLayer } = makeTestLayers()

      // Mock successful SQL execution
      mockSql.mockReturnValue(Effect.succeed([]))

      const program = Effect.gen(function*(_) {
        const schemaManager = yield* _(SchemaManager)
        yield* _(schemaManager.initializeSchema("abcd-1234"))
        yield* _(schemaManager.initializeSchema("abcd-1234"))
      })

      const runnable = Effect.provide(program, schemaManagerLayer).pipe(
        Effect.provide(Layer.setConfigProvider(testConfigProvider))
      )

      Effect.runSync(runnable)

      // Should execute schema initialization SQL twice without errors
      expect(mockSql).toHaveBeenCalledTimes(6) // 2 * (init.sql + functions.sql + partitions)
    })

    it("fails when merchant database URL is missing", () => {
      const { schemaManagerLayer } = makeTestLayers()

      const program = Effect.gen(function*(_) {
        const schemaManager = yield* _(SchemaManager)
        return yield* _(schemaManager.initializeSchema("MISS"))
      })

      const runnable = Effect.provide(program, schemaManagerLayer).pipe(
        Effect.provide(Layer.setConfigProvider(ConfigProvider.fromMap(new Map())))
      )
      const result = Effect.runSyncExit(runnable)

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const error = Cause.failureOption(result.cause)
        expect(Option.isSome(error)).toBe(true)
        if (Option.isSome(error)) {
          expect(error.value).toBeInstanceOf(MissingMerchantDatabaseUrlError)
        }
      }
    })

    it("handles SQL execution errors properly", () => {
      const { mockSql, schemaManagerLayer } = makeTestLayers()

      // Mock SQL execution error
      const sqlError = { _tag: "SqlError", message: "SQL execution failed" } as unknown as SqlError.SqlError
      mockSql.mockReturnValue(Effect.fail(sqlError))

      const program = Effect.gen(function*(_) {
        const schemaManager = yield* _(SchemaManager)
        return yield* _(schemaManager.initializeSchema("abcd-1234"))
      })

      const runnable = Effect.provide(program, schemaManagerLayer).pipe(
        Effect.provide(Layer.setConfigProvider(testConfigProvider))
      )
      const result = Effect.runSyncExit(runnable)

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const error = Cause.failureOption(result.cause)
        expect(Option.isSome(error)).toBe(true)
        if (Option.isSome(error)) {
          expect(error.value).toBeInstanceOf(SchemaInitializationError)
        }
      }
    })
  })

  describe("validateSchema", () => {
    it("returns true when all required tables exist", () => {
      const { mockSql, schemaManagerLayer } = makeTestLayers()

      // Mock all tables exist (return count > 0 for each table)
      mockSql.mockReturnValue(Effect.succeed([{ count: "1" }])) // All required tables exist

      const program = Effect.gen(function*(_) {
        const schemaManager = yield* _(SchemaManager)
        return yield* _(schemaManager.validateSchema("abcd-1234"))
      })

      const runnable = Effect.provide(program, schemaManagerLayer).pipe(
        Effect.provide(Layer.setConfigProvider(testConfigProvider))
      )
      const result = Effect.runSync(runnable)

      expect(result).toBe(true)
    })

    it("returns false when required tables are missing", () => {
      const { mockSql, schemaManagerLayer } = makeTestLayers()

      // Mock some tables missing (return count = 0 for some tables)
      mockSql.mockReturnValue(Effect.succeed([{ count: "0" }])) // Tables missing

      const program = Effect.gen(function*(_) {
        const schemaManager = yield* _(SchemaManager)
        return yield* _(schemaManager.validateSchema("abcd-1234"))
      })

      const runnable = Effect.provide(program, schemaManagerLayer).pipe(
        Effect.provide(Layer.setConfigProvider(testConfigProvider))
      )
      const result = Effect.runSync(runnable)

      expect(result).toBe(false)
    })

    it("handles database connection failure", () => {
      const { mockSql, schemaManagerLayer } = makeTestLayers()

      // Mock database connection error
      const dbError = new Error("Database connection failed")
      mockSql.mockReturnValue(Effect.fail(dbError))

      const program = Effect.gen(function*(_) {
        const schemaManager = yield* _(SchemaManager)
        return yield* _(schemaManager.validateSchema("abcd-1234"))
      })

      const runnable = Effect.provide(program, schemaManagerLayer).pipe(
        Effect.provide(Layer.setConfigProvider(testConfigProvider))
      )
      const result = Effect.runSyncExit(runnable)

      expect(Exit.isFailure(result)).toBe(true)
    })
  })

  describe("integration with DatabaseManager", () => {
    it("uses correct merchant-specific database connections", () => {
      const { factory, mockSql, schemaManagerLayer } = makeTestLayers()

      mockSql.mockReturnValue(Effect.succeed([]))

      const program = Effect.gen(function*(_) {
        const schemaManager = yield* _(SchemaManager)
        yield* _(schemaManager.initializeSchema("abcd-1234"))
        yield* _(schemaManager.initializeSchema("wxyz-5678"))
      })

      const runnable = Effect.provide(program, schemaManagerLayer).pipe(
        Effect.provide(Layer.setConfigProvider(testConfigProvider))
      )

      Effect.runSync(runnable)

      // Should create separate database connections for different merchants
      expect(factory.make).toHaveBeenCalledTimes(2)
    })
  })
})
