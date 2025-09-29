import { Effect } from "effect"

// Track distribution context across fragment queries
let lastDistributionFilter: string | undefined = undefined

/**
 * Shared query simulation logic that can be used across different test harnesses
 */
export class SharedQueryMocks {
  static createProductQuerySimulations<
    TProductData extends {
      product_code: string
      effective_at: string
      archived_at: string | null
      distribution: string
      price_rows?:
        | ReadonlyArray<{
          country: string
          currency: string
          amount: number
          vat_info?: Record<string, unknown> | null
        }>
        | null
    }
  >(products: ReadonlyArray<TProductData>) {
    return {
      // ProductRepository.getProductsByEffectiveDate simulation
      simulateGetProductsByEffectiveDate: (
        query: string,
        resolvedValues: Array<unknown>,
        attachTemplate: <A, E = never, R = never>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
      ) => {
        if (
          query.includes("SELECT * FROM products") && query.includes("WHERE effective_at <= ?") &&
          query.includes("archived_at")
        ) {
          const at_date = resolvedValues[0] as Date
          // resolvedValues[1] is the same date used for archived_at check
          // Use the distribution filter from the fragment query, or try to find it in resolved values
          const distribution = lastDistributionFilter ||
            (resolvedValues.length > 2 ? resolvedValues[2] as string : undefined)

          // Filter products by effective date and distribution
          const filteredProducts = products.filter((p) => {
            const effectiveAt = new Date(p.effective_at)
            const archivedAt = p.archived_at ? new Date(p.archived_at) : null

            // Check if product is active at the given date
            const isEffective = effectiveAt <= at_date
            const isNotArchived = !archivedAt || archivedAt > at_date
            const matchesDistribution = !distribution || p.distribution === distribution

            return isEffective && isNotArchived && matchesDistribution
          })

          return attachTemplate(Effect.succeed(filteredProducts))
        }
        return null
      },

      // ProductRepository.getProductByCode simulation (legacy fallback)
      simulateGetProductByCode: (
        query: string,
        resolvedValues: Array<unknown>,
        attachTemplate: <A, E = never, R = never>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
      ) => {
        if (query.includes("SELECT * FROM products") && query.includes("WHERE product_code = ?")) {
          const productCode = resolvedValues[0] as string
          const product = products.find((p) => p.product_code === productCode)

          if (product) {
            return attachTemplate(Effect.succeed([product]))
          } else {
            // SqlSchema.single throws NoSuchElementException when no results found
            return attachTemplate(Effect.fail({ _tag: "NoSuchElementException" }))
          }
        }
        return null
      },

      // ProductRepository.isProductActive simulation
      simulateIsProductActive: (
        query: string,
        resolvedValues: Array<unknown>,
        attachTemplate: <A, E = never, R = never>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
      ) => {
        if (
          query.includes("SELECT") && query.includes("CASE WHEN COUNT(*) > 0 THEN true ELSE false END as active") &&
          query.includes("FROM products") && query.includes("WHERE product_code = ?")
        ) {
          const productCode = resolvedValues[0] as string
          const atDate = resolvedValues[1] as Date || new Date()
          const product = products.find((p) => p.product_code === productCode)

          const isActive = product &&
            new Date(product.effective_at) <= atDate &&
            (!product.archived_at || new Date(product.archived_at) > atDate)

          return attachTemplate(Effect.succeed([{ active: isActive || false }]))
        }
        return null
      },

      // ProductRepository.getResolvedPrice simulation
      simulateGetResolvedPrice: (
        query: string,
        resolvedValues: Array<unknown>,
        attachTemplate: <A, E = never, R = never>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
      ) => {
        if (
          query.includes("SELECT") && query.includes("pr.country") && query.includes("pr.currency") &&
          query.includes("FROM products p") && query.includes("LEFT JOIN LATERAL")
        ) {
          // Extract product_code and country from the query parameters
          let productCode: string | undefined
          let country: string | undefined

          // Look for product_code and country in resolved values
          for (const value of resolvedValues) {
            if (typeof value === "string") {
              // If it looks like a product code (contains hyphen)
              if (value.includes("-") && value.includes("v")) {
                productCode = value
              } // If it's a country code (2-3 chars) or '*'
              else if ((value.length <= 3 && value === value.toUpperCase()) || value === "*") {
                country = value
              }
            }
          }

          if (productCode && country !== undefined) {
            const product = products.find((p) => p.product_code === productCode)
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
          }

          // No pricing found
          return attachTemplate(Effect.succeed([]))
        }
        return null
      }
    }
  }

  /**
   * Handle SQL fragments that might contain Effect objects
   */
  static handleSqlFragments(
    query: string,
    resolvedValues: Array<unknown>,
    attachTemplate: <A, E = never, R = never>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  ) {
    // Handle distribution fragment query
    if (query.trim() === "AND distribution = ?" && resolvedValues.length === 1) {
      lastDistributionFilter = resolvedValues[0] as string
      // Return empty effect for fragment queries
      return attachTemplate(Effect.succeed([]))
    }
    return null
  }

  /**
   * Reset the distribution filter context
   */
  static resetDistributionFilter() {
    lastDistributionFilter = undefined
  }
}
