import type { MerchantConfig } from "@server/domain/merchants/MerchantConfig.js"
import type { Product } from "@server/domain/products/Product.js"
import { ProductUnavailable, ServiceUnavailable } from "@server/domain/shared/DomainErrors.js"
import { ProductService } from "@server/services/business/ProductService.js"
import { MerchantConfigService } from "@server/services/external/MerchantConfigService.js"
import { ProductRepository } from "@server/services/repositories/ProductRepository.js"
import { Effect } from "effect"

export interface ResolvedPricing {
  product: Product
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
    const productService = yield* ProductService
    const merchantConfigService = yield* MerchantConfigService

    const resolvePrice = (
      product_code: string,
      country: string,
      at_time: Date
    ) =>
      Effect.gen(function*() {
        // 1. Validate product is available for pricing
        const product = yield* productService.validateProductForPricing(
          product_code,
          at_time
        )

        // 2. Resolve price row with country-specific then fallback
        const priceRow = yield* productRepo.getResolvedPrice(product_code, country)
          .pipe(Effect.mapError(() =>
            new ServiceUnavailable({
              service: "PricingService",
              reason: "database_connection_failure",
              details: `Failed to resolve pricing for product: ${product_code}`
            })
          ))

        if (!priceRow) {
          return yield* Effect.fail(
            new ProductUnavailable({
              product_code: product.product_code,
              country,
              reason: "not_available_in_country"
            })
          )
        }

        // 3. Calculate tax breakdown
        const merchantConfig = yield* merchantConfigService.getCurrentMerchantConfig()
          .pipe(Effect.mapError(() =>
            new ServiceUnavailable({
              service: "PricingService",
              reason: "corrupted_configuration",
              details: `Failed to load merchant configuration for pricing: ${product_code}`
            })
          ))

        const taxCalculation = yield* calculateTax(
          priceRow.amount,
          merchantConfig
        )

        const resolvedFrom: ResolvedPricing["resolved_from"] = priceRow.country === country
          ? "country_specific"
          : "fallback"

        return {
          product,
          country,
          currency: priceRow.currency,
          amount: priceRow.amount,
          tax_calculation: taxCalculation,
          resolved_from: resolvedFrom
        }
      })

    const calculateTax = (
      amount: number,
      merchantConfig: MerchantConfig
    ): Effect.Effect<TaxCalculation, never> =>
      Effect.sync(() => {
        switch (merchantConfig.taxRegime) {
          case "vat":
            if (merchantConfig.vatRate) {
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

        return {
          type: "none" as const,
          note: "No tax applicable"
        }
      })

    const validatePricingSnapshot = (
      snapshot: PricingSnapshot,
      resolved: ResolvedPricing
    ): Effect.Effect<void, ProductUnavailable> =>
      Effect.gen(function*() {
        // Validate currency matches
        if (snapshot.currency !== resolved.currency) {
          return yield* Effect.fail(
            new ProductUnavailable({
              product_code: resolved.product.product_code,
              country: snapshot.country,
              reason: "pricing_changed"
            })
          )
        }

        // Validate amount matches (within tolerance for rounding)
        const tolerance = 0.01
        if (Math.abs(snapshot.amount - resolved.amount) > tolerance) {
          return yield* Effect.fail(
            new ProductUnavailable({
              product_code: resolved.product.product_code,
              country: snapshot.country,
              reason: "pricing_changed"
            })
          )
        }

        // Validate tax breakdown if provided
        if (snapshot.tax_breakdown && resolved.tax_calculation.type !== "none") {
          if (snapshot.tax_breakdown.type !== resolved.tax_calculation.type) {
            return yield* Effect.fail(
              new ProductUnavailable({
                product_code: resolved.product.product_code,
                country: snapshot.country,
                reason: "pricing_changed"
              })
            )
          }

          if (resolved.tax_calculation.rate && snapshot.tax_breakdown.rate) {
            const rateTolerance = 0.0001 // 0.01% tolerance
            if (Math.abs(snapshot.tax_breakdown.rate - resolved.tax_calculation.rate) > rateTolerance) {
              return yield* Effect.fail(
                new ProductUnavailable({
                  product_code: resolved.product.product_code,
                  country: snapshot.country,
                  reason: "pricing_changed"
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
    ProductService.Default,
    MerchantConfigService.Default
  ]
}) {}
