import { Product } from "@server/domain/products/Product.js"
import { Credits } from "@server/domain/shared/Credits.js"
import { ProductUnavailable } from "@server/domain/shared/DomainErrors.js"
import { PricingService } from "@server/services/business/PricingService.js"
import { Effect, Option } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { resetMockQueryContext, withTestLayer } from "./helpers/pricing-service-test-harness.js"

describe("PricingService", () => {
  beforeEach(() => resetMockQueryContext())

  describe("resolvePrice", () => {
    describe("Price Resolution", () => {
      it("resolves country-specific pricing first", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PricingService

          const resolved = yield* service.resolvePrice("basic-plan-v1", "US", new Date())

          expect(resolved.product.product_code).toBe("basic-plan-v1")
          expect(resolved.country).toBe("US")
          expect(resolved.currency).toBe("USD")
          expect(resolved.amount).toBe(9.99)
          expect(resolved.resolved_from).toBe("country_specific")
          expect(resolved.tax_calculation.type).toBe("none")
        })).pipe(Effect.runPromise))

      it("falls back to global pricing when country-specific unavailable", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PricingService

          const resolved = yield* service.resolvePrice("basic-plan-v1", "CA", new Date())

          expect(resolved.country).toBe("CA")
          expect(resolved.currency).toBe("USD")
          expect(resolved.amount).toBe(9.99)
          expect(resolved.resolved_from).toBe("fallback")
        })).pipe(Effect.runPromise))
    })

    describe("Product Validation", () => {
      it("fails when product not found", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PricingService

          const result = yield* service.resolvePrice("non-existent", "US", new Date()).pipe(Effect.flip)

          expect(result).toBeInstanceOf(ProductUnavailable)
          expect(result._tag).toBe("ProductUnavailable")
          expect(result.reason).toBe("not_found")
        })).pipe(Effect.runPromise))

      it("fails when product is archived", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PricingService

          const result = yield* service.resolvePrice("archived-plan-v1", "US", new Date()).pipe(Effect.flip)

          expect(result).toBeInstanceOf(ProductUnavailable)
          expect(result._tag).toBe("ProductUnavailable")
          expect(result.reason).toBe("not_found")
        })).pipe(Effect.runPromise))

      it("fails for grant products", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PricingService

          const result = yield* service.resolvePrice("welcome-grant", "US", new Date()).pipe(Effect.flip)

          expect(result).toBeInstanceOf(ProductUnavailable)
          expect(result._tag).toBe("ProductUnavailable")
          expect(result.reason).toBe("not_found")
          expect(result._tag).toBe("InvalidPricingRequest")
        })).pipe(Effect.runPromise))

      it("fails when no pricing available for country", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PricingService

          const result = yield* service.resolvePrice("restricted-plan-v1", "XX", new Date()).pipe(Effect.flip)

          expect(result).toBeInstanceOf(ProductUnavailable)
          expect(result._tag).toBe("ProductUnavailable")
          expect(result.reason).toBe("not_available_in_country")
        })).pipe(Effect.runPromise))
    })
  })

  describe("calculateTax", () => {
    it("calculates VAT for EU merchant to EU customer", () =>
      withTestLayer(Effect.gen(function*() {
        const service = yield* PricingService

        // Test with German merchant config (VAT regime, 19% rate)
        const taxCalc = yield* service.calculateTax(119.00, {
          country: "DE",
          taxRegime: "vat",
          vatRate: 0.19
        } as any)

        expect(taxCalc.type).toBe("vat")
        expect(taxCalc.rate).toBe(0.19)
        expect(taxCalc.tax_amount).toBe(19.00)
        expect(taxCalc.net_amount).toBe(100.00)
      })).pipe(Effect.runPromise))

    it("handles turnover tax regime", () =>
      withTestLayer(Effect.gen(function*() {
        const service = yield* PricingService

        const taxCalc = yield* service.calculateTax(100.00, {
          country: "US",
          taxRegime: "turnover",
          taxStatusNote: "Small business exemption"
        } as any)

        expect(taxCalc.type).toBe("turnover")
        expect(taxCalc.note).toBe("Small business exemption")
      })).pipe(Effect.runPromise))
  })

  describe("validatePricingSnapshot", () => {
    it("validates matching pricing snapshot", () =>
      withTestLayer(Effect.gen(function*() {
        const service = yield* PricingService

        const snapshot = {
          country: "US",
          currency: "USD",
          amount: 9.99
        }

        const resolved = {
          product: Product.make({
            product_code: "basic-plan-v1",
            title: "Basic Plan",
            credits: 1000 as Credits,
            access_period_days: 30,
            distribution: "sellable",
            grant_policy: Option.none(),
            effective_at: new Date("2025-01-01T00:00:00Z"),
            archived_at: Option.none(),
            price_rows: Option.none()
          }),
          country: "US",
          currency: "USD",
          amount: 9.99,
          tax_calculation: { type: "none" as const },
          resolved_from: "country_specific" as const
        }

        yield* service.validatePricingSnapshot(snapshot, resolved)
        // Should not throw
      })).pipe(Effect.runPromise))

    it("fails when currency mismatch", () =>
      withTestLayer(Effect.gen(function*() {
        const service = yield* PricingService

        const snapshot = {
          country: "US",
          currency: "EUR",
          amount: 9.99
        }

        const resolved = {
          product: Product.make({
            product_code: "basic-plan-v1",
            title: "Basic Plan",
            credits: 1000 as Credits,
            access_period_days: 30,
            distribution: "sellable",
            grant_policy: Option.none(),
            effective_at: new Date("2025-01-01T00:00:00Z"),
            archived_at: Option.none(),
            price_rows: Option.none()
          }),
          country: "US",
          currency: "USD",
          amount: 9.99,
          tax_calculation: { type: "none" as const },
          resolved_from: "country_specific" as const
        }

        const result = yield* service.validatePricingSnapshot(snapshot, resolved).pipe(Effect.flip)

        expect(result).toBeInstanceOf(ProductUnavailable)
        expect(result._tag).toBe("ProductUnavailable")
        expect(result.reason).toBe("pricing_changed")
      })).pipe(Effect.runPromise))

    it("fails when amount differs beyond tolerance", () =>
      withTestLayer(Effect.gen(function*() {
        const service = yield* PricingService

        const snapshot = {
          country: "US",
          currency: "USD",
          amount: 10.99 // Different by $1
        }

        const resolved = {
          product: Product.make({
            product_code: "basic-plan-v1",
            title: "Basic Plan",
            credits: 1000 as Credits,
            access_period_days: 30,
            distribution: "sellable",
            grant_policy: Option.none(),
            effective_at: new Date("2025-01-01T00:00:00Z"),
            archived_at: Option.none(),
            price_rows: Option.none()
          }),
          country: "US",
          currency: "USD",
          amount: 9.99,
          tax_calculation: { type: "none" as const },
          resolved_from: "country_specific" as const
        }

        const result = yield* service.validatePricingSnapshot(snapshot, resolved).pipe(Effect.flip)

        expect(result).toBeInstanceOf(ProductUnavailable)
        expect(result._tag).toBe("ProductUnavailable")
        expect(result.reason).toBe("pricing_changed")
      })).pipe(Effect.runPromise))
  })
})
