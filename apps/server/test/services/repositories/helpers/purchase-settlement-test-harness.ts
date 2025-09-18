import { MerchantContext } from "@credit-system/shared"
import { DatabaseManager } from "@server/db/DatabaseManager.js"
import { LedgerRepository } from "@server/services/repositories/LedgerRepository.js"
import { ProductRepository } from "@server/services/repositories/ProductRepository.js"
import { PurchaseSettlementService } from "@server/services/repositories/PurchaseSettlementService.js"
import { ReceiptRepository } from "@server/services/repositories/ReceiptRepository.js"
import { Effect, Layer } from "effect"
import { TestSettlementData } from "../../../fixtures/settlement-test-data.js"

export interface MockQueryContext {
  lastInsertValues: Array<unknown> | null
  lastUpdateValues: Array<unknown> | null
  lastQuery: string
  lastQueryValues: Array<unknown>
  lastTransactionQueries: Array<string>
  transactionCallCount: number
  rollbackCalled: boolean
  commitCalled: boolean
}

const initialContext = (): MockQueryContext => ({
  lastInsertValues: null,
  lastUpdateValues: null,
  lastQuery: "",
  lastQueryValues: [],
  lastTransactionQueries: [],
  transactionCallCount: 0,
  rollbackCalled: false,
  commitCalled: false
})

export const mockQueryContext: MockQueryContext = initialContext()

export const resetMockQueryContext = () => {
  Object.assign(mockQueryContext, initialContext())
}

const mockSqlClient = {
  [Symbol.for("sql-template")]: true,
  raw: (strings: TemplateStringsArray, ...values: Array<unknown>) => {
    const attachTemplate = <A, E = never, R = never>(effect: Effect.Effect<A, E, R>) => {
      if (typeof effect === "object" && effect !== null) {
        const decorated = effect as Effect.Effect<A, E, R> & {
          strings: TemplateStringsArray
          values: Array<unknown>
        }
        decorated.strings = strings
        decorated.values = values
        return decorated
      }
      return effect
    }

    let query = strings[0] ?? ""
    const resolvedValues: Array<unknown> = []

    for (let i = 0; i < values.length; i++) {
      const value = values[i]

      // Handle SQL fragments (conditional SQL fragments from repositories)
      if (value && typeof value === "object") {
        if ("strings" in (value as Record<string, unknown>)) {
          const fragmentStrings = (value as { strings?: ReadonlyArray<string> }).strings
          if (fragmentStrings && fragmentStrings.length > 0) {
            // This is a template literal fragment - extract the SQL text
            const fragmentQuery = fragmentStrings.join("?")
            query += fragmentQuery
            // Extract any parameters from the fragment
            if ("values" in (value as Record<string, unknown>)) {
              const fragmentValues = (value as { values?: Array<unknown> }).values
              if (fragmentValues) {
                resolvedValues.push(...fragmentValues)
              }
            }
            query += strings[i + 1] ?? ""
            continue
          }
        }
      }

      query += "?"
      resolvedValues.push(value)
      query += strings[i + 1] ?? ""
    }

    query = query.trim()
    mockQueryContext.lastQuery = query
    mockQueryContext.lastQueryValues = resolvedValues
    mockQueryContext.lastTransactionQueries.push(query)

    // Simulate database connection errors for specific test scenarios
    if (resolvedValues.some((val) => typeof val === "string" && val.includes("CONNECTION_ERROR"))) {
      const effect = Effect.fail(new Error("ECONNREFUSED"))
      return attachTemplate(effect)
    }

    // Simulate transaction timeout for specific test scenarios
    if (resolvedValues.some((val) => typeof val === "string" && val.includes("TIMEOUT_ERROR"))) {
      const effect = Effect.fail(new Error("Transaction timeout"))
      return attachTemplate(effect)
    }

    // ProductRepository.getProductByCode simulation
    if (query.includes("SELECT * FROM products") && query.includes("WHERE product_code = ?")) {
      const productCode = resolvedValues[0] as string
      const product = TestSettlementData.products.find((p) => p.product_code === productCode)

      // Check if product is active at the specified time
      const now = new Date()
      if (
        product && new Date(product.effective_at) <= now &&
        (!product.archived_at || new Date(product.archived_at) > now)
      ) {
        const effect = Effect.succeed([product])
        return attachTemplate(effect)
      } else {
        const effect = Effect.succeed([])
        return attachTemplate(effect)
      }
    }

    // ProductRepository.isProductActive simulation
    if (
      query.includes("SELECT") && query.includes("CASE WHEN COUNT(*) > 0 THEN true ELSE false END as active") &&
      query.includes("FROM products") && query.includes("WHERE product_code = ?")
    ) {
      const productCode = resolvedValues[0] as string
      const atDate = resolvedValues[1] as Date || new Date()
      const product = TestSettlementData.products.find((p) => p.product_code === productCode)

      const isActive = product &&
        new Date(product.effective_at) <= atDate &&
        (!product.archived_at || new Date(product.archived_at) > atDate)

      const effect = Effect.succeed([{ active: isActive || false }])
      return attachTemplate(effect)
    }

    // ProductRepository.getResolvedPrice simulation
    if (
      query.includes("SELECT") && query.includes("pr.country") && query.includes("pr.currency") &&
      query.includes("FROM products p") && query.includes("LEFT JOIN LATERAL")
    ) {
      const productCode = resolvedValues[0] as string
      const country = resolvedValues[1] as string

      const product = TestSettlementData.products.find((p) => p.product_code === productCode)
      if (product && product.price_rows) {
        // Find country-specific price or fallback to '*'
        let priceRow = product.price_rows.find((pr) => pr.country === country)
        if (!priceRow) {
          priceRow = product.price_rows.find((pr) => pr.country === "*")
        }

        if (priceRow) {
          const effect = Effect.succeed([{
            country: priceRow.country,
            currency: priceRow.currency,
            amount: priceRow.amount,
            vat_info: priceRow.vat_info || null
          }])
          return attachTemplate(effect)
        }
      }

      const effect = Effect.succeed([{
        country: null,
        currency: null,
        amount: null,
        vat_info: null
      }])
      return attachTemplate(effect)
    }

    // ReceiptRepository.getReceiptByLot simulation (for idempotency check)
    if (query.includes("SELECT * FROM receipts") && query.includes("WHERE lot_id = ?")) {
      const lotId = resolvedValues[0] as string
      const existingReceipt = TestSettlementData.existingReceipts.find((r) => r.lot_id === lotId)

      const effect = Effect.succeed(existingReceipt ? [existingReceipt] : [])
      return attachTemplate(effect)
    }

    // ReceiptRepository.getNextReceiptNumber simulation
    if (query.includes("SELECT COALESCE(MAX(") && query.includes("receipt_number")) {
      const seriesPrefix = resolvedValues[0] as string
      const year = resolvedValues[1] as number

      // Generate next receipt number in format R-AM-YYYY-NNNN
      const nextNumber = `${seriesPrefix}-${year}-0001`
      const effect = Effect.succeed([{ next_number: nextNumber }])
      return attachTemplate(effect)
    }

    // LedgerRepository.createCreditLot simulation (INSERT INTO ledger_entries for credit)
    if (
      query.includes("INSERT INTO ledger_entries") &&
      resolvedValues.some((v) =>
        typeof v === "string" && (v === "purchase" || v === "welcome" || v === "promo" || v === "adjustment")
      )
    ) {
      mockQueryContext.lastInsertValues = resolvedValues

      // Check for duplicate external_ref simulation (for idempotency)
      const workflowId = resolvedValues.find((v) => typeof v === "string" && v?.includes("external-ref-")) as string
      if (workflowId && (TestSettlementData.existingExternalRefs as ReadonlyArray<string>).includes(workflowId)) {
        const effect = Effect.fail(new Error("23505")) // PostgreSQL unique constraint violation
        return attachTemplate(effect)
      }

      const effect = Effect.succeed({ insertId: 1 })
      return attachTemplate(effect)
    }

    // ReceiptRepository.createReceipt simulation (INSERT INTO receipts)
    if (query.includes("INSERT INTO receipts")) {
      mockQueryContext.lastInsertValues = resolvedValues
      const effect = Effect.succeed({ insertId: 1 })
      return attachTemplate(effect)
    }

    // Default fallback
    const effect = Effect.succeed([])
    return attachTemplate(effect)
  },

  // Mock withTransaction method
  withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => {
    return Effect.gen(function*() {
      mockQueryContext.transactionCallCount++

      try {
        const result = yield* effect
        mockQueryContext.commitCalled = true
        return result
      } catch (error) {
        mockQueryContext.rollbackCalled = true
        throw error
      }
    })
  }
}

const createMockSql = () => {
  const sqlFunction = (strings: TemplateStringsArray, ...values: Array<unknown>) =>
    mockSqlClient.raw(strings, ...values)

  Object.assign(sqlFunction, {
    [Symbol.for("sql-template")]: true,
    withTransaction: mockSqlClient.withTransaction,
    raw: (queryText: string, params: Array<unknown>) => {
      mockQueryContext.lastQuery = queryText
      mockQueryContext.lastQueryValues = params
      return mockSqlClient.raw([queryText] as any, ...params)
    }
  })

  return sqlFunction as any
}

const MockDatabaseManagerLayer = Layer.succeed(DatabaseManager, {
  getConnection: (_merchantId: string) => Effect.succeed(createMockSql())
})

const MockMerchantContextLayer = Layer.succeed(MerchantContext, {
  merchantId: "test-merchant-id"
})

export const TestLayer = Layer.provide(
  Layer.provide(
    Layer.provide(
      Layer.provide(
        Layer.provide(
          PurchaseSettlementService.DefaultWithoutDependencies,
          Layer.provide(LedgerRepository.DefaultWithoutDependencies, MockDatabaseManagerLayer)
        ),
        Layer.provide(ProductRepository.DefaultWithoutDependencies, MockDatabaseManagerLayer)
      ),
      Layer.provide(ReceiptRepository.DefaultWithoutDependencies, MockDatabaseManagerLayer)
    ),
    MockDatabaseManagerLayer
  ),
  MockMerchantContextLayer
)

export const withTestLayer = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(TestLayer))
