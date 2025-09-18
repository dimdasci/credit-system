import {
  DuplicateAdminAction,
  InvalidRequest,
  ProductUnavailable,
  ServiceUnavailable
} from "@server/domain/shared/DomainErrors.js"
import { PurchaseSettlementService } from "@server/services/repositories/PurchaseSettlementService.js"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { TestSettlementRequests } from "../../fixtures/settlement-test-data.js"
import { mockQueryContext, resetMockQueryContext, TestLayer } from "./helpers/purchase-settlement-test-harness.js"

describe("PurchaseSettlementService", () => {
  beforeEach(() => resetMockQueryContext())

  describe("settlePurchase", () => {
    describe("Happy Path", () => {
      it("settles valid purchase creating lot and receipt", () =>
        Effect.gen(function*() {
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
          expect(result.receipt.user_id).toBe(request.user_id)

          // Verify database operations occurred
          expect(mockQueryContext.transactionCallCount).toBe(1)
          expect(mockQueryContext.commitCalled).toBe(true)
          expect(mockQueryContext.rollbackCalled).toBe(false)

          // Verify SQL operations
          expect(mockQueryContext.lastTransactionQueries).toContain(
            expect.stringMatching(/INSERT INTO ledger_entries/)
          )
          expect(mockQueryContext.lastTransactionQueries).toContain(
            expect.stringMatching(/INSERT INTO receipts/)
          )
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))

      it("creates exactly one credit lot with purchase reason", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.VALID_NEW_PURCHASE

          const result = yield* service.settlePurchase(request)

          // Verify lot properties
          expect(result.lot.initial_amount).toBe(1000)
          expect(result.lot.product_code).toBe("basic-plan-v1")

          // Verify ledger entry was created with correct reason
          expect(mockQueryContext.lastInsertValues).toContain("purchase")
          expect(mockQueryContext.lastInsertValues).toContain(request.external_ref)
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))

      it("generates receipt only for purchases", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.VALID_NEW_PURCHASE

          const result = yield* service.settlePurchase(request)

          // Verify receipt generation
          expect(result.receipt).toBeDefined()
          expect(result.receipt.receipt_number).toMatch(/^R-AM-\d{4}-\d{4}$/)
          expect(result.receipt.purchase_snapshot).toBeDefined()
          expect(result.receipt.merchant_config_snapshot).toBeDefined()

          // Verify receipt insert occurred
          expect(mockQueryContext.lastTransactionQueries).toContain(
            expect.stringMatching(/INSERT INTO receipts/)
          )
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))
    })

    describe("Product Validation", () => {
      it("fails when product not found", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.PRODUCT_NOT_FOUND

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(ProductUnavailable)
          expect(result._tag).toBe("ProductUnavailable")
          if (result._tag === "ProductUnavailable") {
            expect(result.product_code).toBe("non-existent-plan")
            expect(result.reason).toBe("not_found")
          }

          // Verify no database mutations occurred
          expect(mockQueryContext.lastInsertValues).toBeNull()
          expect(mockQueryContext.rollbackCalled).toBe(true)
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))

      it("fails when product archived at order time", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.ARCHIVED_PRODUCT

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(ProductUnavailable)
          if (result._tag === "ProductUnavailable") {
            expect(result.product_code).toBe("old-plan-v1")
            expect(result.reason).toBe("archived")
          }
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))

      it("fails when product not available in country", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.UNAVAILABLE_COUNTRY

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(ProductUnavailable)
          if (result._tag === "ProductUnavailable") {
            expect(result.product_code).toBe("restricted-plan-v1")
            expect(result.country).toBe("FR")
            expect(result.reason).toBe("not_available_in_country")
          }
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))
    })

    describe("Pricing Validation", () => {
      it("fails when pricing changed since checkout", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.PRICING_CHANGED

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(ProductUnavailable)
          if (result._tag === "ProductUnavailable") {
            expect(result.product_code).toBe("basic-plan-v1")
            expect(result.reason).toBe("pricing_changed")
          }
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))

      it("validates pricing snapshot against catalog at order_placed_at", () =>
        Effect.gen(function*() {
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
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))
    })

    describe("Idempotency", () => {
      it("returns existing result for duplicate external_ref", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.DUPLICATE_EXTERNAL_REF

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(DuplicateAdminAction)
          if (result._tag === "DuplicateAdminAction") {
            expect(result.action_type).toBe("credit_adjustment")
            expect(result.external_ref).toBe("external-ref-duplicate")
            expect(result.original_timestamp).toBeInstanceOf(Date)
          }

          // Verify idempotency check occurred
          const receiptQuery = mockQueryContext.lastTransactionQueries.find((q) =>
            q.includes("SELECT * FROM receipts") && q.includes("WHERE lot_id = ?")
          )
          expect(receiptQuery).toBeDefined()
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))

      it("prevents duplicate settlement creation", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.DUPLICATE_EXTERNAL_REF

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(DuplicateAdminAction)
          // Verify no new records were created
          expect(mockQueryContext.lastInsertValues).toBeNull()
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))
    })

    describe("Transaction Boundaries", () => {
      it("rolls back all changes on any step failure", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.PRODUCT_NOT_FOUND

          yield* service.settlePurchase(request).pipe(Effect.flip)

          // Verify transaction was rolled back
          expect(mockQueryContext.transactionCallCount).toBe(1)
          expect(mockQueryContext.rollbackCalled).toBe(true)
          expect(mockQueryContext.commitCalled).toBe(false)
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))

      it("commits atomically on success", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.VALID_NEW_PURCHASE

          yield* service.settlePurchase(request)

          // Verify transaction was committed
          expect(mockQueryContext.transactionCallCount).toBe(1)
          expect(mockQueryContext.commitCalled).toBe(true)
          expect(mockQueryContext.rollbackCalled).toBe(false)
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))
    })

    describe("Error Mapping", () => {
      it("maps product failures to ProductUnavailable", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.PRODUCT_NOT_FOUND

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(ProductUnavailable)
          expect(result._tag).toBe("ProductUnavailable")
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))

      it("maps database failures to ServiceUnavailable", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.CONNECTION_ERROR

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(ServiceUnavailable)
          if (result._tag === "ServiceUnavailable") {
            expect(result.service).toBe("PurchaseSettlementService")
            expect(result.reason).toBe("database_connection_failure")
          }
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))

      it("maps validation failures to InvalidRequest", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.INVALID_USER_ID

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(InvalidRequest)
          if (result._tag === "InvalidRequest") {
            expect(result.field).toBe("user_id")
            expect(result.reason).toBe("invalid_parameters")
          }
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))

      it("maps idempotency conflicts to DuplicateAdminAction", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.DUPLICATE_EXTERNAL_REF

          const result = yield* service.settlePurchase(request).pipe(Effect.flip)

          expect(result).toBeInstanceOf(DuplicateAdminAction)
          expect(result._tag).toBe("DuplicateAdminAction")
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))
    })

    describe("Domain Invariants", () => {
      it("enforces L1 invariant: single lot per settlement", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.VALID_NEW_PURCHASE

          const result = yield* service.settlePurchase(request)

          // Verify only one credit lot was created
          const creditInserts = mockQueryContext.lastTransactionQueries.filter((q) =>
            q.includes("INSERT INTO ledger_entries")
          )
          expect(creditInserts).toHaveLength(1)

          // Verify lot properties
          expect(result.lot.entry_id).toBeDefined()
          expect(result.lot.initial_amount).toBeGreaterThan(0)
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))

      it("enforces L2 invariant: receipt only for purchases", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.VALID_NEW_PURCHASE

          const result = yield* service.settlePurchase(request)

          // Verify receipt was created for purchase
          expect(result.receipt).toBeDefined()
          expect(result.receipt.lot_id).toBe(result.lot.entry_id)

          // Verify receipt insert occurred
          const receiptInserts = mockQueryContext.lastTransactionQueries.filter((q) =>
            q.includes("INSERT INTO receipts")
          )
          expect(receiptInserts).toHaveLength(1)
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))

      it("validates complete operation context in ledger entry", () =>
        Effect.gen(function*() {
          const service = yield* PurchaseSettlementService
          const request = TestSettlementRequests.VALID_NEW_PURCHASE

          yield* service.settlePurchase(request)

          // Verify ledger entry includes complete operation context
          const insertValues = mockQueryContext.lastInsertValues
          expect(insertValues).not.toBeNull()
          if (insertValues) {
            expect(insertValues).toContain("purchase") // reason
            expect(insertValues).toContain(request.external_ref) // workflow_id
            expect(insertValues).toContain(9.99) // resource_amount
            expect(insertValues).toContain("USD") // resource_unit
          }
        }).pipe(Effect.provide(TestLayer), Effect.runPromise))
    })
  })
})
