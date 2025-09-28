import { MerchantContext } from "@credit-system/shared"
import { PricingService } from "@server/services/business/PricingService.js"
import { DatabaseManager } from "@server/services/external/DatabaseManager.js"
import { MerchantConfigService } from "@server/services/external/MerchantConfigService.js"
import { ProductRepository } from "@server/services/repositories/ProductRepository.js"
import { ConfigProvider, Effect, Layer } from "effect"
import { PricingTestMerchantConfigs, PricingTestProducts } from "../../../fixtures/pricing-test-data.js"
import { SharedQueryMocks } from "./shared-query-mocks.js"

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

// Create shared query simulations
const productQueryMocks = SharedQueryMocks.createProductQuerySimulations(PricingTestProducts)

export const resetMockQueryContext = () => {
  Object.assign(mockQueryContext, initialContext())
  SharedQueryMocks.resetDistributionFilter()
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

      // Handle Effect objects (empty SQL fragments)
      if (value && typeof value === "object" && "_tag" in (value as Record<string, unknown>)) {
        const effectValue = value as { _tag: string; value?: unknown }
        // Skip empty SQL fragments (these are typically conditional fragments that evaluated to empty)
        if (effectValue._tag === "Success" && Array.isArray(effectValue.value) && effectValue.value.length === 0) {
          // This is an empty fragment, skip it
          query += strings[i + 1] ?? ""
          continue
        }
      }

      // Handle SQL fragments with actual content
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

    // Try shared query simulations
    const fragmentResult = SharedQueryMocks.handleSqlFragments(query, resolvedValues, attachTemplate)
    if (fragmentResult) return fragmentResult

    const getProductsByEffectiveDateResult = productQueryMocks.simulateGetProductsByEffectiveDate(
      query,
      resolvedValues,
      attachTemplate
    )
    if (getProductsByEffectiveDateResult) return getProductsByEffectiveDateResult

    const getProductByCodeResult = productQueryMocks.simulateGetProductByCode(query, resolvedValues, attachTemplate)
    if (getProductByCodeResult) return getProductByCodeResult

    const getResolvedPriceResult = productQueryMocks.simulateGetResolvedPrice(query, resolvedValues, attachTemplate)
    if (getResolvedPriceResult) return getResolvedPriceResult

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
