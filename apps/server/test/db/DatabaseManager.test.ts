import { SqlClient } from "@effect/sql"
import { DatabaseManager, MissingMerchantDatabaseUrlError } from "@server/services/external/DatabaseManager.js"
import { DatabaseManagerLive, PgLayerFactory } from "@server/services/external/DatabaseManagerImpl.js"
import { Cause, ConfigProvider, Effect, Exit, Layer, Option } from "effect"
import { describe, expect, it, vi } from "vitest"

const testConfigProvider = ConfigProvider.fromMap(
  new Map([
    ["MERCHANT_ABCD_DATABASE_URL", "postgres://test:test@localhost:5432/abcd"],
    ["MERCHANT_WXYZ_DATABASE_URL", "postgres://test:test@localhost:5432/wxyz"]
  ])
)

const makeTestFactory = () => {
  const mockSqlClient = {
    safe: vi.fn(),
    withoutTransform: vi.fn()
  } as any
  const mockLayer = Layer.succeed(SqlClient.SqlClient, mockSqlClient)

  const factory = {
    make: vi.fn((_) => mockLayer)
  }

  const layer = Layer.succeed(PgLayerFactory, factory)
  return { factory, layer }
}

describe("DatabaseManager", () => {
  it("getConnection() fails when the environment variable is missing", () => {
    const { layer: testFactoryLayer } = makeTestFactory()
    const testLayer = Layer.provide(DatabaseManagerLive, testFactoryLayer)

    const program = Effect.gen(function*(_) {
      const dbManager = yield* _(DatabaseManager)
      return yield* _(dbManager.getConnection("MISS"))
    })

    const runnable = Effect.provide(program, testLayer).pipe(
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

  it("getConnection() returns a connection for a valid merchant ID", () => {
    const { factory, layer: testFactoryLayer } = makeTestFactory()
    const testLayer = Layer.provide(DatabaseManagerLive, testFactoryLayer)

    const program = Effect.gen(function*(_) {
      const dbManager = yield* _(DatabaseManager)
      const conn = yield* _(dbManager.getConnection("abcd-1234"))
      expect(conn).toBeDefined()
    })

    const runnable = Effect.provide(program, testLayer).pipe(
      Effect.provide(Layer.setConfigProvider(testConfigProvider))
    )

    Effect.runSync(runnable)
    expect(factory.make).toHaveBeenCalledOnce()
  })

  it("getConnection() caches and reuses the connection pool for the same merchant", () => {
    const { factory, layer: testFactoryLayer } = makeTestFactory()
    const testLayer = Layer.provide(DatabaseManagerLive, testFactoryLayer)

    const program = Effect.gen(function*(_) {
      const dbManager = yield* _(DatabaseManager)
      yield* _(dbManager.getConnection("abcd-1234"))
      yield* _(dbManager.getConnection("abcd-5678"))
      yield* _(dbManager.getConnection("abcd-9012"))
    })

    const runnable = Effect.provide(program, testLayer).pipe(
      Effect.provide(Layer.setConfigProvider(testConfigProvider))
    )

    Effect.runSync(runnable)
    expect(factory.make).toHaveBeenCalledTimes(1)
  })

  it("getConnection() handles different merchant IDs independently", () => {
    const { factory, layer: testFactoryLayer } = makeTestFactory()
    const testLayer = Layer.provide(DatabaseManagerLive, testFactoryLayer)

    const program = Effect.gen(function*(_) {
      const dbManager = yield* _(DatabaseManager)
      yield* _(dbManager.getConnection("abcd-1234"))
      yield* _(dbManager.getConnection("wxyz-5678"))
    })

    const runnable = Effect.provide(program, testLayer).pipe(
      Effect.provide(Layer.setConfigProvider(testConfigProvider))
    )

    Effect.runSync(runnable)
    expect(factory.make).toHaveBeenCalledTimes(2)
  })
})
