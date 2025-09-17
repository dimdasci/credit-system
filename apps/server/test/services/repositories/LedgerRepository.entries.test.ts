import { LedgerEntry } from "@server/domain/credit-ledger/LedgerEntry.js"
import { Product } from "@server/domain/products/Product.js"
import { createMonthDate } from "@server/domain/shared/MonthDate.js"
import { LedgerRepository } from "@server/services/repositories/LedgerRepository.js"
import { Effect, Schema } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { TestLedgerEntries, TestUsers } from "../../fixtures/ledger-test-data.js"
import { TestProducts } from "../../fixtures/product-test-data.js"
import { mockQueryContext, resetMockQueryContext, TestLayer } from "./helpers/ledger-repository-test-harness.js"

describe("LedgerRepository entry mutations", () => {
  beforeEach(() => resetMockQueryContext())

  describe("createLedgerEntry", () => {
    it("computes created_month from created_at before persisting", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const newEntry = Schema.decodeSync(LedgerEntry)({
          entry_id: "11111111-2222-3333-4444-555555555555",
          user_id: TestUsers.USER_1,
          lot_id: "11111111-2222-3333-4444-555555555555",
          lot_month: "2025-03-01",
          amount: 30,
          reason: "purchase",
          operation_type: "test_operation",
          resource_amount: null,
          resource_unit: null,
          workflow_id: null,
          product_code: "TEST_PRODUCT",
          expires_at: "2025-04-01T00:00:00Z",
          created_at: "2025-03-05T10:00:00Z",
          created_month: "1900-01-01"
        })

        yield* repo.createLedgerEntry(newEntry)

        const insertValues = mockQueryContext.lastInsertValues
        expect(insertValues).not.toBeNull()
        const insertedCreatedAt = (insertValues ?? [])[12] as Date | string
        const insertedCreatedMonth = (insertValues ?? [])[13] as string

        expect(new Date(insertedCreatedAt).toISOString()).toBe(newEntry.created_at.toISOString())
        expect(insertedCreatedMonth).toBe(createMonthDate(newEntry.created_at))
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("createCreditLot", () => {
    it("creates issuance entry and returns lot summary", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository

        const product = Schema.decodeSync(Product)(TestProducts.SELLABLE_BASIC)

        const createdAt = new Date("2025-03-05T10:00:00Z")
        const lot = yield* repo.createCreditLot(TestUsers.USER_1, product, {
          operation_type: "payment_card",
          resource_amount: 99.99,
          resource_unit: "USD",
          workflow_id: "workflow-credit-lot",
          created_at: createdAt
        })

        expect(lot.user_id).toBe(TestUsers.USER_1)
        expect(lot.initial_amount).toBe(product.credits)
        expect(lot.product_code).toBe(product.product_code)
        expect(lot.created_month).toBe(createMonthDate(createdAt))

        const insertValues = mockQueryContext.lastInsertValues
        expect(insertValues).not.toBeNull()
        const values = insertValues ?? []
        expect(values[1]).toBe(TestUsers.USER_1)
        expect(values[2]).toBe(values[0])
        expect(values[4]).toBe(product.credits)
        expect(values[5]).toBe("purchase")
        expect(values[6]).toBe("payment_card")
        expect(values[10]).toBe(product.product_code)
        expect(new Date(values[11] as Date).toISOString()).toBe(new Date(lot.expires_at).toISOString())
        expect(new Date(values[12] as Date).toISOString()).toBe(createdAt.toISOString())
        expect(values[13]).toBe(createMonthDate(createdAt))
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("recordDebit", () => {
    it("creates a negative ledger entry referencing target lot", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository

        const debitEntry = yield* repo.recordDebit(TestUsers.USER_1, {
          operation_type: "usage_api",
          amount: 25,
          resource_amount: 1000,
          resource_unit: "tokens",
          workflow_id: "workflow-debit",
          created_at: new Date("2025-02-20T12:00:00Z")
        }, {
          lot_id: TestLedgerEntries.PURCHASE_LOT_1.lot_id,
          lot_month: TestLedgerEntries.PURCHASE_LOT_1.lot_month
        })

        expect(debitEntry.lot_id).toBe(TestLedgerEntries.PURCHASE_LOT_1.lot_id)
        expect(debitEntry.amount).toBe(-25)
        expect(debitEntry.reason).toBe("debit")

        const insertValues = mockQueryContext.lastInsertValues
        expect(insertValues).not.toBeNull()
        const values = insertValues ?? []
        expect(values[2]).toBe(TestLedgerEntries.PURCHASE_LOT_1.lot_id)
        expect(values[3]).toBe(TestLedgerEntries.PURCHASE_LOT_1.lot_month)
        expect(values[4]).toBe(-25)
        expect(values[5]).toBe("debit")
        expect(values[6]).toBe("usage_api")
        expect(values[10]).toBeNull()
        expect(values[11]).toBeNull()
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })
})
