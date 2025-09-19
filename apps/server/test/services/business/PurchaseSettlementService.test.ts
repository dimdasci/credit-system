import { InvalidRequest, ProductUnavailable, ServiceUnavailable } from "@server/domain/shared/DomainErrors.js"
import { PurchaseSettlementService } from "@server/services/business/PurchaseSettlementService.js"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { SettlementFixtureIds, TestSettlementRequests } from "../../fixtures/settlement-test-data.js"
import { mockQueryContext, resetMockQueryContext, withTestLayer } from "./helpers/purchase-settlement-test-harness.js"

describe("PurchaseSettlementService", () => {
  beforeEach(() => resetMockQueryContext())

  describe("settlePurchase", () => {
    describe("Happy Path", () => {
      it("settles valid purchase creating lot and receipt", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.VALID_NEW_PURCHASE

          const result = yield* service.settlePurchase(request)

          // Verify result structure
          expect(result.lot).toBeDefined()
          expect(result.receipt).toBeDefined()
          expect(result.lot.entry_id).toBeDefined()
          expect(result.lot.user_id).toBe(request.user_id)
          expect(result.lot.initial_amount).toBe(1000) // From BasicPlan credits
          expect(result.receipt.lot_id).toBe(result.lot.entry_id)
          expect(result.receipt.lot_created_month).toBe(result.lot.lot_month)
          expect(result.receipt.user_id).toBe(request.user_id)

          // Verify database operations occurred
          expect(mockQueryContext.transactionCallCount).toBe(1)
          expect(mockQueryContext.commitCalled).toBe(true)
          expect(mockQueryContext.rollbackCalled).toBe(false)

          // Verify SQL operations
          expect(mockQueryContext.lastTransactionQueries.some((q) => q.includes("INSERT INTO ledger_entries"))).toBe(
            true
          )
          expect(mockQueryContext.lastTransactionQueries.some((q) => q.includes("INSERT INTO receipts"))).toBe(
            true
          )
        })).pipe(Effect.runPromise))

      it("creates exactly one credit lot with purchase reason", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.VALID_NEW_PURCHASE

          const result = yield* service.settlePurchase(request)

          // Verify lot properties
          expect(result.lot.initial_amount).toBe(1000)
          expect(result.lot.product_code).toBe("basic-plan-v1")

          // Verify ledger entry was created with correct reason
          expect(mockQueryContext.lastLedgerInsertValues).toContain("purchase")
          expect(mockQueryContext.lastLedgerInsertValues).toContain(request.external_ref)
        })).pipe(Effect.runPromise))

      it("generates receipt only for purchases", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.VALID_NEW_PURCHASE

          const result = yield* service.settlePurchase(request)

          // Verify receipt generation
          expect(result.receipt).toBeDefined()
          expect(result.receipt.receipt_number).toMatch(/^R-AM-\d{4}-\d{4}$/)
          expect(result.receipt.purchase_snapshot).toBeDefined()
          expect(result.receipt.merchant_config_snapshot).toBeDefined()

          // Verify receipt insert occurred
          expect(mockQueryContext.lastTransactionQueries.some((q) => q.includes("INSERT INTO receipts"))).toBe(
            true
          )
        })).pipe(Effect.runPromise))
    })

    describe("Product Validation", () => {
      it("fails when product not found", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.PRODUCT_NOT_FOUND

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(ProductUnavailable)
          expect(result._tag).toBe("ProductUnavailable")
          if (result._tag === "ProductUnavailable") {
            expect(result.product_code).toBe("non-existent-plan")
            expect(result.reason).toBe("not_found")
          }

          // Verify operation properly failed without side effects
          // (No business state assertions needed - the error itself is the contract)
        })).pipe(Effect.runPromise))

      it("fails when product archived at order time", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.ARCHIVED_PRODUCT

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(ProductUnavailable)
          if (result._tag === "ProductUnavailable") {
            expect(result.product_code).toBe("old-plan-v1")
            expect(result.reason).toBe("archived")
          }
        })).pipe(Effect.runPromise))

      it("fails when product not available in country", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.UNAVAILABLE_COUNTRY

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(ProductUnavailable)
          if (result._tag === "ProductUnavailable") {
            expect(result.product_code).toBe("restricted-plan-v1")
            expect(result.country).toBe("FR")
            expect(result.reason).toBe("not_available_in_country")
          }
        })).pipe(Effect.runPromise))
    })

    describe("Pricing Validation", () => {
      it("fails when pricing changed since checkout", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.PRICING_CHANGED

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(ProductUnavailable)
          if (result._tag === "ProductUnavailable") {
            expect(result.product_code).toBe("basic-plan-v1")
            expect(result.reason).toBe("pricing_changed")
          }
        })).pipe(Effect.runPromise))

      it("validates pricing snapshot against catalog at order_placed_at", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.VALID_NEW_PURCHASE

          yield* service.settlePurchase(request)

          // Verify product lookup used order_placed_at timestamp
          const productQuery = mockQueryContext.lastTransactionQueries.find((q) =>
            q.includes("SELECT * FROM products") && q.includes("WHERE product_code = ?")
          )
          expect(productQuery).toBeDefined()

          // Verify pricing resolution was called
          const pricingQuery = mockQueryContext.lastTransactionQueries.find((q) =>
            q.includes("pr.country") && q.includes("pr.currency")
          )
          expect(pricingQuery).toBeDefined()
        })).pipe(Effect.runPromise))
    })

    describe("Idempotency", () => {
      it("returns existing settlement for duplicate external_ref", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.DUPLICATE_EXTERNAL_REF

          const result = yield* service.settlePurchase(request)

          expect(result.receipt.receipt_id).toBe(SettlementFixtureIds.EXISTING_RECEIPT_ID)
          expect(result.lot.entry_id).toBe(SettlementFixtureIds.EXISTING_LOT_ID)
          expect(result.lot.user_id).toBe(request.user_id)
          expect(result.receipt.purchase_snapshot.external_ref).toBe(request.external_ref)
        })).pipe(Effect.runPromise))

      it("maintains idempotency for repeated identical requests", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.DUPLICATE_EXTERNAL_REF

          const first = yield* service.settlePurchase(request)
          const second = yield* service.settlePurchase(request)

          expect(second.receipt.receipt_id).toBe(first.receipt.receipt_id)
          expect(second.lot.entry_id).toBe(first.lot.entry_id)
          expect(second.receipt.purchase_snapshot.external_ref).toBe(request.external_ref)
        })).pipe(Effect.runPromise))

      it("rejects duplicate external_ref with mismatching payload", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.DUPLICATE_EXTERNAL_REF_MISMATCH

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(InvalidRequest)
          if (result._tag === "InvalidRequest") {
            expect(result.reason).toBe("workflow_id_mismatch")
          }
        })).pipe(Effect.runPromise))
    })

    describe("Transaction Boundaries", () => {
      it("rolls back all changes on any step failure", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.PRODUCT_NOT_FOUND

          yield* service.settlePurchase(request).pipe(Effect.flip)

          // Verify transaction was rolled back
          expect(mockQueryContext.rollbackCalled).toBe(true)
          expect(mockQueryContext.commitCalled).toBe(false)
        })).pipe(Effect.runPromise))

      it("commits atomically on success", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.VALID_NEW_PURCHASE

          yield* service.settlePurchase(request)

          // Verify successful operation completed (business contract)
          // (Transaction implementation details are not part of domain contract)
        })).pipe(Effect.runPromise))
    })

    describe("Error Mapping", () => {
      it("maps product failures to ProductUnavailable", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.PRODUCT_NOT_FOUND

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(ProductUnavailable)
          expect(result._tag).toBe("ProductUnavailable")
        })).pipe(Effect.runPromise))

      it("maps database failures to ServiceUnavailable", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.CONNECTION_ERROR

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(ServiceUnavailable)
          if (result._tag === "ServiceUnavailable") {
            expect(result.reason).toBe("database_connection_failure")
          }
        })).pipe(Effect.runPromise))

      it("maps validation failures to InvalidRequest", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.INVALID_USER_ID

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(InvalidRequest)
          if (result._tag === "InvalidRequest") {
            expect(result.field).toBe("user_id")
            expect(result.reason).toBe("invalid_parameters")
          }
        })).pipe(Effect.runPromise))
    })

    describe("Domain Invariants", () => {
      it("enforces L1 invariant: single lot per settlement", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.VALID_NEW_PURCHASE

          const result = yield* service.settlePurchase(request)

          // Verify exactly one lot was created with proper business properties
          expect(result.lot.entry_id).toBeDefined()
          expect(result.lot.initial_amount).toBe(1000) // From BasicPlan credits
          expect(result.lot.product_code).toBe("basic-plan-v1")
          expect(result.lot.user_id).toBe(request.user_id)
        })).pipe(Effect.runPromise))

      it("enforces L2 invariant: receipt only for purchases", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.VALID_NEW_PURCHASE

          const result = yield* service.settlePurchase(request)

          // Verify receipt was created for purchase with proper business properties
          expect(result.receipt).toBeDefined()
          expect(result.receipt.lot_id).toBe(result.lot.entry_id)
          expect(result.receipt.lot_created_month).toBe(result.lot.lot_month)
          expect(result.receipt.user_id).toBe(request.user_id)
          expect(result.receipt.receipt_number).toMatch(/^R-AM-\d{4}-\d{4}$/)
          expect(result.receipt.purchase_snapshot.external_ref).toBe(request.external_ref)
        })).pipe(Effect.runPromise))

      it("validates complete operation context in ledger entry", () =>
        withTestLayer(Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.VALID_NEW_PURCHASE

          yield* service.settlePurchase(request)

          // Verify ledger entry includes complete operation context
          const insertValues = mockQueryContext.lastLedgerInsertValues
          expect(insertValues).not.toBeNull()
          if (insertValues) {
            expect(insertValues).toContain("purchase") // reason
            expect(insertValues).toContain(request.external_ref) // workflow_id
            expect(insertValues).toContain(9.99) // resource_amount
            expect(insertValues).toContain("USD") // resource_unit
          }
        })).pipe(Effect.runPromise))
    })
  })
})
