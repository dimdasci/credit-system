import { MerchantContext } from "@credit-system/shared"
import { DatabaseManager } from "@server/db/DatabaseManager.js"
import { ReceiptRepository as ReceiptRepositoryService } from "@server/services/repositories/ReceiptRepository.js"
import { Effect, Layer } from "effect"

export interface MockReceiptQueryContext {
  lastInsertValues: Array<unknown> | null
  lastQueryText: string | null
  lastQueryIncludesLimit: boolean
  lastQueryIncludesDateFilter: boolean
  lastQueryIncludesYear: boolean
  nextSelectResult: Array<unknown>
  simulateConstraintViolation: string | null
  simulateConnectionError: boolean
}

const initialContext = (): MockReceiptQueryContext => ({
  lastInsertValues: null,
  lastQueryText: null,
  lastQueryIncludesLimit: false,
  lastQueryIncludesDateFilter: false,
  lastQueryIncludesYear: false,
  nextSelectResult: [],
  simulateConstraintViolation: null,
  simulateConnectionError: false
})

export const mockQueryContext: MockReceiptQueryContext = initialContext()

export const resetMockQueryContext = () => {
  Object.assign(mockQueryContext, initialContext())
}

const attachTemplate = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  if (typeof effect === "object" && effect !== null) {
    ;(effect as any).strings = [""]
    ;(effect as any).values = []
  }
  return effect
}

const mockSqlClient = {
  [Symbol.for("sql-template")]: true,
  raw: (strings: TemplateStringsArray, ...values: Array<unknown>) => {
    // Track query characteristics - build the full query including fragments
    let fullQuery = strings[0] || ""
    for (let i = 0; i < values.length; i++) {
      const value = values[i]

      // Handle SQL fragments (they might contain LIMIT, etc.)
      if (value && typeof value === "object" && "strings" in (value as any)) {
        const fragment = (value as any).strings?.[0] || ""
        fullQuery += fragment
      } else {
        fullQuery += String(value)
      }

      fullQuery += strings[i + 1] || ""
    }

    mockQueryContext.lastQueryText = fullQuery
    mockQueryContext.lastQueryIncludesLimit = fullQuery.toUpperCase().includes("LIMIT") ||
      values.some((v) =>
        v && typeof v === "object" && (v as any).strings?.some((s: string) => s.toUpperCase().includes("LIMIT"))
      )
    mockQueryContext.lastQueryIncludesDateFilter = fullQuery.includes("issued_at")

    // Enhanced year detection - check values, query text, and fragment strings
    mockQueryContext.lastQueryIncludesYear = values.some((v) => typeof v === "number" && v >= 2020 && v <= 2030) ||
      /20[2-3][0-9]/.test(fullQuery) ||
      strings.some((s) => /20[2-3][0-9]/.test(s)) ||
      values.some((v) => v && typeof v === "object" && (v as any).strings?.some((s: string) => /20[2-3][0-9]/.test(s)))

    // Check for INSERT operations
    if (fullQuery.toUpperCase().includes("INSERT")) {
      mockQueryContext.lastInsertValues = values

      // Simulate constraint violation if configured
      if (mockQueryContext.simulateConstraintViolation) {
        const error = new Error("Unique constraint violation") as any
        error.code = mockQueryContext.simulateConstraintViolation
        return attachTemplate(Effect.fail(error))
      }

      return attachTemplate(Effect.void)
    }

    // Check for sequence operations (DO $$ blocks and CREATE SEQUENCE)
    if (fullQuery.includes("DO $$") || fullQuery.includes("CREATE SEQUENCE") || fullQuery.includes("nextval")) {
      return attachTemplate(Effect.succeed(mockQueryContext.nextSelectResult))
    }

    // Simulate connection errors if configured
    if (mockQueryContext.simulateConnectionError) {
      const error = new Error("Connection refused") as any
      error.code = "ECONNREFUSED"
      return attachTemplate(Effect.fail(error))
    }

    // Return configured mock data for SELECT operations
    return attachTemplate(Effect.succeed(mockQueryContext.nextSelectResult))
  },
  unsafe: (_sqlString: string) => {
    // Handle unsafe SQL fragments (like ORDER BY)
    return { [Symbol.for("sql-template")]: true }
  }
}

const mockIn = (column: string, values: Array<string>) => {
  return { _tag: "InFragment", column, values }
}

const mockSqlTemplate = (strings: TemplateStringsArray, ...values: Array<unknown>) => {
  return mockSqlClient.raw(strings, ...values)
}

// Add the `in` method to the template function
Object.assign(mockSqlTemplate, {
  in: mockIn,
  [Symbol.for("sql-template")]: true
})

const MockDatabaseManager = Layer.succeed(DatabaseManager, {
  getConnection: (_merchantId: string) => Effect.succeed(mockSqlTemplate as any)
})

const MockMerchantContextLayer = Layer.succeed(MerchantContext, {
  merchantId: "TEST_MERCHANT"
})

export const TestLayer = Layer.provide(
  Layer.provide(
    ReceiptRepositoryService.Default,
    MockDatabaseManager
  ),
  MockMerchantContextLayer
)
