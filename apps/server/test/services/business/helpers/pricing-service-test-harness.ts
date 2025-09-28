import { MerchantContext } from "@credit-system/shared"
import { PricingService } from "@server/services/business/PricingService.js"
import { DatabaseManager } from "@server/services/external/DatabaseManager.js"
import { MerchantConfigService } from "@server/services/external/MerchantConfigService.js"
import { ProductRepository } from "@server/services/repositories/ProductRepository.js"
import { ConfigProvider, Effect, Layer } from "effect"
import { PricingTestMerchantConfigs, PricingTestProducts } from "../../../fixtures/pricing-test-data.js"

export interface MockQueryContext {
  lastQuery: string
  lastQueryValues: Array<unknown>
  queryCount: number
}

const initialContext = (): MockQueryContext => ({
  lastQuery: "",
  lastQueryValues: [],
  queryCount: 0
})

export const mockQueryContext: MockQueryContext = initialContext()

export const resetMockQueryContext = () => {
  Object.assign(mockQueryContext, initialContext())
}

const createMockSql = () => {
  const attachTemplate = <A, E = never, R = never>(effect: Effect.Effect<A, E, R>) => {
    if (typeof effect === "object" && effect !== null) {
      const decorated = effect as Effect.Effect<A, E, R> & {
        strings: TemplateStringsArray
        values: Array<unknown>
      }
      decorated.strings = Object.assign([], { raw: [] as any })
      decorated.values = []
      return decorated
    }
    return effect
  }

  const sqlFunction = (strings: TemplateStringsArray, ...values: Array<unknown>) => {
    let query = strings[0] ?? ""
    const resolvedValues: Array<unknown> = []

    for (let i = 0; i < values.length; i++) {
      const value = values[i]

      // Handle SQL fragments
      if (value && typeof value === "object" && "strings" in (value as Record<string, unknown>)) {
        const fragmentStrings = (value as { strings?: ReadonlyArray<string> }).strings
        if (fragmentStrings && fragmentStrings.length > 0) {
          const fragmentQuery = fragmentStrings.join("?")
          query += fragmentQuery
          if ("values" in (value as Record<string, unknown>)) {
            const fragmentValues = (value as { values?: Array<unknown> }).values
            if (fragmentValues) {
              for (const val of fragmentValues) {
                resolvedValues.push(val)
              }
            }
          }
          query += strings[i + 1] ?? ""
          continue
        }
      }

      query += "?"
      resolvedValues.push(value)
      query += strings[i + 1] ?? ""
    }

    query = query.trim()
    mockQueryContext.lastQuery = query
    mockQueryContext.lastQueryValues = resolvedValues
    mockQueryContext.queryCount++

    // ProductRepository.getProductByCode simulation
    if (query.includes("SELECT * FROM products") && query.includes("WHERE product_code = ?")) {
      const productCode = resolvedValues[0] as string
      const product = PricingTestProducts.find((p) => p.product_code === productCode)

      if (product) {
        return attachTemplate(Effect.succeed([product]))
      } else {
        return attachTemplate(Effect.fail({ _tag: "NoSuchElementException" }))
      }
    }

    // ProductRepository.getResolvedPrice simulation
    if (
      query.includes("SELECT") && query.includes("pr.country") && query.includes("pr.currency") &&
      query.includes("FROM products p") && query.includes("LEFT JOIN LATERAL")
    ) {
      const country = resolvedValues[0] as string
      const productCode = resolvedValues[2] as string

      const product = PricingTestProducts.find((p) => p.product_code === productCode)
      if (product && product.price_rows) {
        const priceRow = product.price_rows.find((pr) => pr.country === country) ??
          product.price_rows.find((pr) => pr.country === "*")

        if (priceRow) {
          return attachTemplate(Effect.succeed([{
            country: priceRow.country,
            currency: priceRow.currency,
            amount: priceRow.amount,
            vat_info: priceRow.vat_info || null
          }]))
        }
      }

      // No pricing found for this specific country
      return attachTemplate(Effect.succeed([{
        country: null,
        currency: null,
        amount: null,
        vat_info: null
      }]))
    }

    // Default: successful empty result
    return attachTemplate(Effect.succeed([]))
  }

  // Add the symbol for sql template identification
  Object.defineProperty(sqlFunction, Symbol.for("sql-template"), { value: true })

  return sqlFunction as any
}

const mockSqlClient = createMockSql()

export const withTestLayer = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  // Create fresh, non-memoized layers for each test execution
  const mockDatabaseManagerLayer = Layer.fresh(
    Layer.succeed(DatabaseManager, {
      getConnection: (_merchantId: string) => Effect.succeed(mockSqlClient)
    })
  )

  const mockMerchantContextLayer = Layer.fresh(
    Layer.succeed(MerchantContext, {
      merchantId: PricingTestMerchantConfigs.VAT_MERCHANT.merchantId
    })
  )

  // Create test ConfigProvider that provides merchant configuration environment variables
  const testConfig = PricingTestMerchantConfigs.VAT_MERCHANT
  const configMap = new Map([
    ["MERCHANT_9327_LEGAL_NAME", testConfig.legalName],
    ["MERCHANT_9327_TAX_REGIME", testConfig.taxRegime],
    ["MERCHANT_9327_VAT_RATE", testConfig.vatRate?.toString() || ""],
    ["MERCHANT_9327_RECEIPT_PREFIX", testConfig.receiptSeriesPrefix],
    ["MERCHANT_9327_REGISTERED_ADDRESS", testConfig.registeredAddress],
    ["MERCHANT_9327_COUNTRY", testConfig.country],
    ["MERCHANT_9327_OPERATION_TIMEOUT_MINUTES", testConfig.operationTimeoutMinutes.toString()],
    ["MERCHANT_9327_RETENTION_YEARS", testConfig.retentionYears.toString()]
  ])

  // Only add taxStatusNote if it exists on the config
  if ("taxStatusNote" in testConfig && testConfig.taxStatusNote) {
    configMap.set("MERCHANT_9327_TAX_STATUS_NOTE", String(testConfig.taxStatusNote))
  }

  const testConfigProvider = ConfigProvider.fromMap(configMap)

  const baseLayer = Layer.mergeAll(
    mockMerchantContextLayer,
    mockDatabaseManagerLayer
  )

  const testLayer = Layer.mergeAll(
    baseLayer,
    Layer.provide(ProductRepository.Default, Layer.fresh(baseLayer)),
    Layer.provide(MerchantConfigService.Default, Layer.fresh(baseLayer)),
    Layer.provide(PricingService.Default, Layer.fresh(baseLayer))
  )

  return effect.pipe(
    Effect.provide(testLayer),
    Effect.withConfigProvider(testConfigProvider)
  )
}
