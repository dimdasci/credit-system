import { MerchantContext } from "@credit-system/shared"
import { DatabaseManager } from "@server/db/DatabaseManager.js"
import { ProductRepository } from "@server/services/repositories/ProductRepository.js"
import { Effect, Layer, Option } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { TestProductsArray } from "../../fixtures/product-test-data.js"

// Mock DatabaseManager with preset test data
// Track context for complex queries
const mockQueryContext = { distribution: null as string | null }

const mockMutations = {
  archived: [] as Array<{ code: string; archivedAt: Date }>
}

const referenceNow = new Date("2025-03-01T00:00:00Z")

const TestPriceRows: Record<
  string,
  Array<{
    country: string
    currency: string
    amount: number
    vat_info: Record<string, unknown> | null
  }>
> = {
  TEST_BASIC: [
    { country: "US", currency: "USD", amount: 19.99, vat_info: { rate: 0.2 } },
    { country: "*", currency: "USD", amount: 20.99, vat_info: null }
  ],
  TEST_WELCOME: [
    { country: "*", currency: "GBP", amount: 5.5, vat_info: null }
  ]
}

const mockSqlClient = {
  // Mock SQL template literal handler
  [Symbol.for("sql-template")]: true,
  raw: (strings: TemplateStringsArray, ...values: Array<unknown>) => {
    const query = strings.join("?").trim()

    // Handle distribution fragment (from conditional SQL) - this gets called first
    if (query === "AND distribution = ?" && values.length === 1) {
      mockQueryContext.distribution = values[0] as string
      return Effect.succeed("") // Return empty string for composition
    }

    // Handle empty fragment
    if (query === "" && values.length === 0) {
      return Effect.succeed("") // Empty fragment
    }

    // Handle single product lookup
    if (
      query.includes("SELECT * FROM products") && query.includes("WHERE product_code = ?") && query.includes("LIMIT 1")
    ) {
      if (!query.includes("AND effective_at <= NOW()")) {
        throw new Error("Expected effective_at filter for getProductByCode")
      }
      if (!query.includes("AND (archived_at IS NULL OR archived_at > NOW())")) {
        throw new Error("Expected archived_at filter for getProductByCode")
      }
      const productCode = values[0] as string
      const product = TestProductsArray.find((p) => p.product_code === productCode)
      if (!product) {
        return Effect.succeed([])
      }

      const effectiveAt = new Date(product.effective_at)
      const archivedAt = product.archived_at ? new Date(product.archived_at) : null
      const activeNow = effectiveAt <= referenceNow && (!archivedAt || archivedAt > referenceNow)
      return Effect.succeed(activeNow ? [product] : [])
    }

    // Handle active products query
    if (
      query.includes("SELECT * FROM products") && query.includes("WHERE effective_at <= NOW()") &&
      query.includes("AND archived_at IS NULL") && !query.includes("AND distribution")
    ) {
      if (!query.includes("ORDER BY effective_at DESC, product_code ASC")) {
        throw new Error("Expected ordering by effective_at and product_code for active products")
      }
      const activeProducts = TestProductsArray.filter((p) =>
        new Date(p.effective_at) <= referenceNow && p.archived_at === null
      )
      return Effect.succeed(activeProducts)
    }

    // Handle sellable products query
    if (
      query.includes("SELECT * FROM products") && query.includes("WHERE effective_at <= NOW()") &&
      query.includes("AND archived_at IS NULL") && query.includes("AND distribution = 'sellable'")
    ) {
      if (!query.includes("ORDER BY effective_at DESC, product_code ASC")) {
        throw new Error("Expected ordering by effective_at and product_code for sellable products")
      }
      const sellableProducts = TestProductsArray.filter((p) =>
        new Date(p.effective_at) <= referenceNow &&
        p.archived_at === null &&
        p.distribution === "sellable"
      )
      return Effect.succeed(sellableProducts)
    }

    // Handle products by effective date - check context for distribution filter
    if (
      query.includes("SELECT * FROM products") && query.includes("WHERE effective_at <= ?") &&
      query.includes("AND (archived_at IS NULL OR archived_at > ?)")
    ) {
      if (!query.includes("ORDER BY effective_at DESC, product_code ASC")) {
        throw new Error("Expected ordering by effective_at and product_code for lifecycle query")
      }
      const atDate = values[0] as Date
      const distribution = mockQueryContext.distribution

      // Reset context
      mockQueryContext.distribution = null

      const productsAtDate = TestProductsArray.filter((p) => {
        const dateMatch = new Date(p.effective_at) <= atDate &&
          (p.archived_at === null || new Date(p.archived_at) > atDate)
        const distributionMatch = !distribution || p.distribution === distribution
        return dateMatch && distributionMatch
      })

      return Effect.succeed(productsAtDate)
    }

    // Handle product activity check
    if (query.includes("CASE WHEN COUNT(*) > 0 THEN true ELSE false END as active")) {
      if (!query.includes("WHERE product_code = ?")) {
        throw new Error("Expected product_code filter in activity check")
      }
      const productCode = values[0] as string
      const atDate = values[1] as Date
      const product = TestProductsArray.find((p) => p.product_code === productCode)
      const isActive = product &&
        new Date(product.effective_at) <= atDate &&
        (product.archived_at === null || new Date(product.archived_at) > atDate)
      return Effect.succeed([{ active: Boolean(isActive) }])
    }

    // Handle price resolution query
    if (query.includes("FROM price_rows") && query.includes("LEFT JOIN LATERAL")) {
      const requestedCountry = values[0] as string
      const productCode = values[2] as string
      const priceRows = TestPriceRows[productCode] ?? []
      const directMatch = priceRows.find((row) => row.country === requestedCountry)
      const fallbackMatch = priceRows.find((row) => row.country === "*")
      const resolved = directMatch ?? fallbackMatch
      return Effect.succeed(resolved ? [resolved] : [])
    }

    // Handle CREATE and UPDATE operations
    if (query.includes("INSERT INTO products")) {
      return Effect.succeed({ insertId: 1 })
    }

    if (query.includes("UPDATE products") && query.includes("SET archived_at = ?")) {
      if (!query.includes("WHERE product_code = ?")) {
        throw new Error("Expected product_code filter when archiving product")
      }
      mockMutations.archived.push({
        code: values[1] as string,
        archivedAt: values[0] as Date
      })
      return Effect.succeed({ affectedRows: 1 })
    }

    // Default return for unmatched queries
    return Effect.succeed([])
  }
}

// Proxy to handle template literal syntax
const createMockSql = () => {
  const sqlFunction = (strings: TemplateStringsArray, ...values: Array<unknown>) => {
    return mockSqlClient.raw(strings, ...values)
  }

  // Add properties and support for fragment composition
  Object.assign(sqlFunction, {
    [Symbol.for("sql-template")]: true,
    raw: mockSqlClient.raw
  })

  return sqlFunction as any
}

const MockDatabaseManagerLayer = Layer.succeed(DatabaseManager, {
  getConnection: () => Effect.succeed(createMockSql())
})

const MockMerchantContextLayer = Layer.succeed(MerchantContext, {
  merchantId: "test-merchant-id"
})

const TestLayer = Layer.provide(
  Layer.provide(
    ProductRepository.DefaultWithoutDependencies,
    MockDatabaseManagerLayer
  ),
  MockMerchantContextLayer
)

beforeEach(() => {
  mockQueryContext.distribution = null
  mockMutations.archived = []
})

describe("ProductRepository Business Logic", () => {
  describe("getProductByCode", () => {
    it("returns product when it exists", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository
        const product = yield* repo.getProductByCode("TEST_BASIC")

        expect(product).not.toBeNull()
        expect(product?.product_code).toBe("TEST_BASIC")
        expect(product?.title).toBe("Test Basic Package")
        expect(product?.distribution).toBe("sellable")
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("returns null when product does not exist", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository
        const product = yield* repo.getProductByCode("NON_EXISTENT")

        expect(product).toBeNull()
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("treats archived products as unavailable", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository
        const product = yield* repo.getProductByCode("TEST_ARCHIVED")

        expect(product).toBeNull()
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getActiveProducts", () => {
    it("returns only active products (not archived, effective now)", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository
        const activeProducts = yield* repo.getActiveProducts()

        // Should include: SELLABLE_BASIC, GRANT_WELCOME, GRANT_MANUAL
        // Should exclude: ARCHIVED_OLD (archived), FUTURE_PREMIUM (not effective yet)
        expect(activeProducts).toHaveLength(3)

        const codes = activeProducts.map((p) => p.product_code)
        expect(codes).toContain("TEST_BASIC")
        expect(codes).toContain("TEST_WELCOME")
        expect(codes).toContain("TEST_MANUAL_GRANT")
        expect(codes).not.toContain("TEST_ARCHIVED")
        expect(codes).not.toContain("TEST_FUTURE")
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getSellableProducts", () => {
    it("returns only sellable active products", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository
        const sellableProducts = yield* repo.getSellableProducts()

        // Should only include: SELLABLE_BASIC
        // Should exclude grants and archived/future products
        expect(sellableProducts).toHaveLength(1)
        expect(sellableProducts[0].product_code).toBe("TEST_BASIC")
        expect(sellableProducts[0].distribution).toBe("sellable")
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getProductsByEffectiveDate", () => {
    it("returns products effective at specific date", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository

        // Test date when ARCHIVED_OLD was active (before it was archived)
        const testDate = new Date("2024-10-01T00:00:00Z")
        const products = yield* repo.getProductsByEffectiveDate(testDate)

        // Should include ARCHIVED_OLD at this date (it was active then)
        // Should exclude FUTURE_PREMIUM (not effective until 2025-06-01)
        const codes = products.map((p) => p.product_code)
        expect(codes).toContain("TEST_ARCHIVED") // Was active in Oct 2024
        expect(codes).not.toContain("TEST_FUTURE") // Not effective until June 2025
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("filters by distribution when specified", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository
        const testDate = new Date("2025-02-01T00:00:00Z")

        const grantProducts = yield* repo.getProductsByEffectiveDate(testDate, "grant")

        // Should only return grant products effective at test date
        expect(grantProducts.every((p) => p.distribution === "grant")).toBe(true)
        const codes = grantProducts.map((p) => p.product_code)
        expect(codes).toContain("TEST_WELCOME")
        expect(codes).toContain("TEST_MANUAL_GRANT")
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getResolvedPrice", () => {
    it("returns country-specific pricing when available", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository
        const price = yield* repo.getResolvedPrice("TEST_BASIC", "US")

        expect(price).not.toBeNull()
        expect(price?.country).toBe("US")
        expect(price?.currency).toBe("USD")
        expect(price?.amount).toBeCloseTo(19.99)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("falls back to wildcard pricing when direct match is missing", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository
        const price = yield* repo.getResolvedPrice("TEST_WELCOME", "FR")

        expect(price).not.toBeNull()
        expect(price?.country).toBe("*")
        expect(price?.currency).toBe("GBP")
        expect(price?.amount).toBeCloseTo(5.5)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("returns null when no pricing rows exist", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository
        const price = yield* repo.getResolvedPrice("TEST_MANUAL_GRANT", "US")

        expect(price).toBeNull()
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("archiveProduct", () => {
    it("updates archived_at using the product_code column", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository
        const archivedAt = new Date("2025-03-01T00:00:00Z")

        yield* repo.archiveProduct("TEST_BASIC", archivedAt)

        expect(mockMutations.archived).toHaveLength(1)
        expect(mockMutations.archived[0]).toEqual({ code: "TEST_BASIC", archivedAt })
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("isProductActive", () => {
    it("returns true for active products at current date", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository
        const isActive = yield* repo.isProductActive("TEST_BASIC")

        expect(isActive).toBe(true)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("returns false for archived products", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository
        const isActive = yield* repo.isProductActive("TEST_ARCHIVED")

        expect(isActive).toBe(false)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("returns false for future products not yet effective", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository
        const isActive = yield* repo.isProductActive("TEST_FUTURE")

        expect(isActive).toBe(false)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("respects custom date parameter", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository

        // Test when ARCHIVED_OLD was still active
        const pastDate = new Date("2024-10-01T00:00:00Z")
        const wasActive = yield* repo.isProductActive("TEST_ARCHIVED", pastDate)

        expect(wasActive).toBe(true)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("Business rule validation through data", () => {
    it("sellable products have no grant_policy", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository
        const sellableProducts = yield* repo.getSellableProducts()

        sellableProducts.forEach((product) => {
          expect(product.grant_policy._tag).toBe("None")
        })
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("grant products have grant_policy set", () =>
      Effect.gen(function*() {
        const repo = yield* ProductRepository
        const allProducts = yield* repo.getActiveProducts()
        const grantProducts = allProducts.filter((p) => p.distribution === "grant")

        grantProducts.forEach((product) => {
          expect(product.grant_policy._tag).toBe("Some")
          expect(["apply_on_signup", "manual_grant"]).toContain(Option.getOrThrow(product.grant_policy))
        })
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })
})
