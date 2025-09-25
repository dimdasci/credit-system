import { InvalidRequest, ProductUnavailable } from "@server/domain/shared/DomainErrors.js"
import { MerchantConfigService } from "@server/services/external/MerchantConfigService.js"
import { ProductRepository } from "@server/services/repositories/ProductRepository.js"
import { Effect, Option } from "effect"

// Service interfaces
export interface ResolvedPricing {
  product_code: string
  country: string
  currency: string
  amount: number // tax-inclusive
  tax_calculation: TaxCalculation
  resolved_from: "country_specific" | "fallback"
}

export interface TaxCalculation {
  type: "vat" | "turnover" | "none"
  rate?: number
  tax_amount?: number
  net_amount?: number
  note?: string
}

export interface PricingSnapshot {
  country: string
  currency: string
  amount: number
  tax_breakdown?: TaxBreakdown
}

export interface TaxBreakdown {
  type: "vat" | "turnover" | "none"
  rate?: number
  amount?: number
  note?: string
}

// Service implementation
export class PricingService extends Effect.Service<PricingService>()("PricingService", {
  effect: Effect.gen(function*() {
    const productRepo = yield* ProductRepository
    const merchantConfigService = yield* MerchantConfigService

    const resolvePrice = (product_code: string, country: string, at_time: Date) =>
      Effect.gen(function*() {
        // 1. Get product and validate availability
        const product = yield* productRepo.getProductByCode(product_code)
        if (!product) {
          return yield* Effect.fail(
            new ProductUnavailable({
              product_code,
              reason: "not_found"
            })
          )
        }

        // Check product is active at the specified time
        if (
          product.effective_at > at_time ||
          (Option.isSome(product.archived_at) && product.archived_at.value <= at_time)
        ) {
          return yield* Effect.fail(
            new ProductUnavailable({
              product_code,
              reason: "archived"
            })
          )
        }

        // 2. Grant products have no pricing
        if (product.distribution === "grant") {
          return yield* Effect.fail(
            new InvalidRequest({
              reason: "invalid_parameters",
              details: "Grant products do not have pricing"
            })
          )
        }

        // 3. Resolve price row with country-specific then fallback
        let priceRow = yield* productRepo.getResolvedPrice(product_code, country)
        let resolvedFrom: "country_specific" | "fallback" = "country_specific"

        if (!priceRow) {
          // Try fallback pricing (country = '*')
          priceRow = yield* productRepo.getResolvedPrice(product_code, "*")
          resolvedFrom = "fallback"
        }

        if (!priceRow) {
          return yield* Effect.fail(
            new ProductUnavailable({
              product_code,
              country,
              reason: "not_available_in_country"
            })
          )
        }

        // 4. Calculate tax breakdown
        const merchantConfig = yield* merchantConfigService.getCurrentMerchantConfig()
        const taxCalculation = calculateTax(
          priceRow.amount,
          country,
          merchantConfig
        )

        return {
          product_code,
          country,
          currency: priceRow.currency,
          amount: priceRow.amount,
          tax_calculation: taxCalculation,
          resolved_from: resolvedFrom
        }
      })

    const calculateTax = (amount: number, country: string, merchantConfig: any) => {
      // Tax calculation based on merchant regime and target country
      switch (merchantConfig.taxRegime) {
        case "vat":
          if (merchantConfig.vatRate && shouldApplyVAT(country, merchantConfig.country)) {
            const vatRate = merchantConfig.vatRate
            const netAmount = amount / (1 + vatRate)
            const taxAmount = amount - netAmount

            return {
              type: "vat" as const,
              rate: vatRate,
              tax_amount: Math.round(taxAmount * 100) / 100,
              net_amount: Math.round(netAmount * 100) / 100,
              note: `VAT ${(vatRate * 100).toFixed(1)}%`
            }
          }
          break

        case "turnover":
          return {
            type: "turnover" as const,
            note: merchantConfig.taxStatusNote || "Turnover tax regime"
          }

        case "none":
          return {
            type: "none" as const,
            note: "Tax exempt"
          }
      }

      // Default: no tax applied
      return {
        type: "none" as const,
        note: "No tax applicable"
      }
    }

    const validatePricingSnapshot = (snapshot: PricingSnapshot, resolved: ResolvedPricing) =>
      Effect.gen(function*() {
        // Validate currency matches
        if (snapshot.currency !== resolved.currency) {
          return yield* Effect.fail(
            new InvalidRequest({
              field: "currency",
              reason: "format_violation",
              details: `Currency mismatch: expected ${resolved.currency}, got ${snapshot.currency}`
            })
          )
        }

        // Validate amount matches (within tolerance for rounding)
        const tolerance = 0.01
        if (Math.abs(snapshot.amount - resolved.amount) > tolerance) {
          return yield* Effect.fail(
            new InvalidRequest({
              field: "amount",
              reason: "format_violation",
              details: `Amount mismatch: expected ${resolved.amount}, got ${snapshot.amount}`
            })
          )
        }

        // Validate tax breakdown if provided
        if (snapshot.tax_breakdown && resolved.tax_calculation.type !== "none") {
          if (snapshot.tax_breakdown.type !== resolved.tax_calculation.type) {
            return yield* Effect.fail(
              new InvalidRequest({
                field: "tax_type",
                reason: "format_violation",
                details:
                  `Tax type mismatch: expected ${resolved.tax_calculation.type}, got ${snapshot.tax_breakdown.type}`
              })
            )
          }

          if (resolved.tax_calculation.rate && snapshot.tax_breakdown.rate) {
            const rateTolerance = 0.0001 // 0.01% tolerance
            if (Math.abs(snapshot.tax_breakdown.rate - resolved.tax_calculation.rate) > rateTolerance) {
              return yield* Effect.fail(
                new InvalidRequest({
                  field: "tax_rate",
                  reason: "format_violation",
                  details:
                    `Tax rate mismatch: expected ${resolved.tax_calculation.rate}, got ${snapshot.tax_breakdown.rate}`
                })
              )
            }
          }
        }
      })

    return { resolvePrice, calculateTax, validatePricingSnapshot } as const
  }),
  dependencies: [
    ProductRepository.Default,
    MerchantConfigService.Default
  ]
}) {}

// Helper functions
const shouldApplyVAT = (targetCountry: string, merchantCountry: string): boolean => {
  // Simplified EU VAT logic - real implementation would use comprehensive rules
  const euCountries = new Set(["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PT", "IE", "GR", "FI", "LU"])

  return euCountries.has(merchantCountry) && euCountries.has(targetCountry)
}
