import type * as SqlError from "@effect/sql/SqlError"
import type { MerchantConfig } from "@server/domain/merchants/MerchantConfig.js"
import { ServiceUnavailable } from "@server/domain/shared/DomainErrors.js"
import type { MissingMerchantDatabaseUrlError } from "@server/services/external/DatabaseManager.js"
import type {
  InvalidMerchantConfigError,
  MissingMerchantConfigError
} from "@server/services/external/MerchantConfigService.js"
import { MerchantConfigService } from "@server/services/external/MerchantConfigService.js"
import { ProductRepository } from "@server/services/repositories/ProductRepository.js"
import { Effect, Option, Schema } from "effect"
import type { ConfigError } from "effect/ConfigError"
import type { ParseError } from "effect/ParseResult"

export class CountryNotSupported extends Schema.TaggedError<CountryNotSupported>("CountryNotSupported")(
  "CountryNotSupported",
  {
    product_code: Schema.String,
    country: Schema.String
  }
) {}

export class InvalidPricingRequest extends Schema.TaggedError<InvalidPricingRequest>("InvalidPricingRequest")(
  "InvalidPricingRequest",
  {
    product_code: Schema.String,
    reason: Schema.String
  }
) {}

export class PricingMismatch extends Schema.TaggedError<PricingMismatch>("PricingMismatch")(
  "PricingMismatch",
  {
    field: Schema.String,
    expected: Schema.Unknown,
    provided: Schema.Unknown
  }
) {}

export class ProductNotFound extends Schema.TaggedError<ProductNotFound>("ProductNotFound")(
  "ProductNotFound",
  {
    product_code: Schema.String
  }
) {}

export class ProductNotAvailable extends Schema.TaggedError<ProductNotAvailable>("ProductNotAvailable")(
  "ProductNotAvailable",
  {
    product_code: Schema.String,
    at_time: Schema.Date,
    reason: Schema.Literal("archived", "not_active")
  }
) {}

export type PricingError =
  | CountryNotSupported
  | InvalidPricingRequest
  | PricingMismatch
  | ProductNotFound
  | ProductNotAvailable

export const PricingErrorTypeId: unique symbol = Symbol.for("credit-system/PricingError")
export type PricingErrorTypeId = typeof PricingErrorTypeId

export declare namespace PricingError {
  export interface Proto {
    readonly _tag: "PricingError"
    readonly [PricingErrorTypeId]: PricingErrorTypeId
  }
}

const mapToServiceUnavailable = <A>(
  effect: Effect.Effect<
    A,
    | ConfigError
    | MissingMerchantConfigError
    | InvalidMerchantConfigError
    | MissingMerchantDatabaseUrlError
    | SqlError.SqlError
    | ParseError
  >,
  productCode: string
) =>
  effect.pipe(
    Effect.catchTags({
      ConfigError: (error) =>
        Effect.fail(
          new ServiceUnavailable({
            service: "PricingService",
            reason: "corrupted_configuration",
            details: `Error in configuration: ${error.message}`
          })
        ),
      MissingMerchantConfigError: (error) =>
        Effect.fail(
          new ServiceUnavailable({
            service: "PricingService",
            reason: "corrupted_configuration",
            details: `Merchant configuration unavailable: ${error.toString()}`
          })
        ),
      InvalidMerchantConfigError: (error) =>
        Effect.fail(
          new ServiceUnavailable({
            service: "PricingService",
            reason: "corrupted_configuration",
            details: `Invalid merchant configuration: ${error.toString()}`
          })
        ),
      MissingMerchantDatabaseUrlError: (error) =>
        Effect.fail(
          new ServiceUnavailable({
            service: "PricingService",
            reason: "corrupted_configuration",
            details: `Missing merchant database URL: ${error.message}`
          })
        ),
      SqlError: (error) =>
        Effect.fail(
          new ServiceUnavailable({
            service: "PricingService",
            reason: "database_connection_failure",
            details: `Database error while accessing product ${productCode}: ${error.message}`
          })
        ),
      ParseError: (error) =>
        Effect.fail(
          new ServiceUnavailable({
            service: "PricingService",
            reason: "data_corruption",
            details: `Failed to parse data from repository for product ${productCode}: ${error.message}`
          })
        )
    })
  )

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

    const resolvePrice = (
      product_code: string,
      country: string,
      at_time: Date
    ) =>
      Effect.gen(function*() {
        // 1. Get product and validate availability
        const product = yield* mapToServiceUnavailable(productRepo.getProductByCode(product_code), product_code)

        if (!product) {
          return yield* Effect.fail(new ProductNotFound({ product_code }))
        }

        // Check product is active at the specified time
        if (product.effective_at > at_time) {
          return yield* Effect.fail(
            new ProductNotAvailable({
              product_code,
              at_time,
              reason: "not_active"
            })
          )
        }

        if (Option.isSome(product.archived_at) && product.archived_at.value <= at_time) {
          return yield* Effect.fail(
            new ProductNotAvailable({
              product_code,
              at_time,
              reason: "archived"
            })
          )
        }

        // 2. Grant products have no pricing
        if (product.distribution === "grant") {
          return yield* Effect.fail(
            new InvalidPricingRequest({
              product_code,
              reason: "grant_products_do_not_have_pricing"
            })
          )
        }

        // 3. Resolve price row with country-specific then fallback
        const priceRow = yield* mapToServiceUnavailable(
          productRepo.getResolvedPrice(product_code, country),
          product_code
        )

        if (!priceRow) {
          return yield* Effect.fail(new CountryNotSupported({ product_code, country }))
        }

        // 4. Calculate tax breakdown
        const merchantConfig = yield* mapToServiceUnavailable(
          merchantConfigService.getCurrentMerchantConfig(),
          product_code
        )

        const taxCalculation = yield* calculateTax(
          priceRow.amount,
          merchantConfig
        )

        const resolvedFrom: ResolvedPricing["resolved_from"] = priceRow.country === country
          ? "country_specific"
          : "fallback"

        return {
          product_code,
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
    ): Effect.Effect<TaxCalculation, PricingError> =>
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
    ): Effect.Effect<void, PricingError> =>
      Effect.gen(function*() {
        // Validate currency matches
        if (snapshot.currency !== resolved.currency) {
          return yield* Effect.fail(
            new PricingMismatch({
              field: "currency",
              expected: resolved.currency,
              provided: snapshot.currency
            })
          )
        }

        // Validate amount matches (within tolerance for rounding)
        const tolerance = 0.01
        if (Math.abs(snapshot.amount - resolved.amount) > tolerance) {
          return yield* Effect.fail(
            new PricingMismatch({
              field: "amount",
              expected: resolved.amount,
              provided: snapshot.amount
            })
          )
        }

        // Validate tax breakdown if provided
        if (snapshot.tax_breakdown && resolved.tax_calculation.type !== "none") {
          if (snapshot.tax_breakdown.type !== resolved.tax_calculation.type) {
            return yield* Effect.fail(
              new PricingMismatch({
                field: "tax_type",
                expected: resolved.tax_calculation.type,
                provided: snapshot.tax_breakdown.type
              })
            )
          }

          if (resolved.tax_calculation.rate && snapshot.tax_breakdown.rate) {
            const rateTolerance = 0.0001 // 0.01% tolerance
            if (Math.abs(snapshot.tax_breakdown.rate - resolved.tax_calculation.rate) > rateTolerance) {
              return yield* Effect.fail(
                new PricingMismatch({
                  field: "tax_rate",
                  expected: resolved.tax_calculation.rate,
                  provided: snapshot.tax_breakdown.rate
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
