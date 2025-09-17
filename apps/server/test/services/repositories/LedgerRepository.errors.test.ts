import { LedgerRepository } from "@server/services/repositories/LedgerRepository.js"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { TestUsers } from "../../fixtures/ledger-test-data.js"
import { TestProducts } from "../../fixtures/product-test-data.js"
import { resetMockQueryContext, TestLayer } from "./helpers/ledger-repository-test-harness.js"

describe("LedgerRepository error handling", () => {
  beforeEach(() => resetMockQueryContext())

  describe("selectFIFOLots validation errors", () => {
    it("throws InvalidRequest for negative required_credits", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const result = yield* repo.selectFIFOLots(TestUsers.USER_1, -10)
          .pipe(Effect.flip) // Flip to expect error

        expect(result._tag).toBe("InvalidRequest")
        if (result._tag === "InvalidRequest") {
          expect(result.field).toBe("required_credits")
          expect(result.reason).toBe("invalid_amount")
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("throws InvalidRequest for zero required_credits", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const result = yield* repo.selectFIFOLots(TestUsers.USER_1, 0)
          .pipe(Effect.flip)

        expect(result._tag).toBe("InvalidRequest")
        if (result._tag === "InvalidRequest") {
          expect(result.field).toBe("required_credits")
          expect(result.reason).toBe("invalid_amount")
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("throws InvalidRequest for empty user_id", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const result = yield* repo.selectFIFOLots("", 100)
          .pipe(Effect.flip)

        expect(result._tag).toBe("InvalidRequest")
        if (result._tag === "InvalidRequest") {
          expect(result.field).toBe("user_id")
          expect(result.reason).toBe("invalid_parameters")
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("throws InsufficientBalance when no active lots exist", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const result = yield* repo.selectFIFOLots("user-with-no-lots", 100)
          .pipe(Effect.flip)

        expect(result._tag).toBe("InsufficientBalance")
        if (result._tag === "InsufficientBalance") {
          expect(result.reason).toBe("no_active_lots")
          expect(result.user_id).toBe("user-with-no-lots")
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("createCreditLot validation errors", () => {
    it("throws InvalidRequest for empty user_id", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const result = yield* repo.createCreditLot("", TestProducts.SELLABLE_BASIC, {
          operation_type: "test_operation"
        }).pipe(Effect.flip)

        expect(result._tag).toBe("InvalidRequest")
        if (result._tag === "InvalidRequest") {
          expect(result.field).toBe("user_id")
          expect(result.reason).toBe("invalid_parameters")
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("throws InvalidRequest for product with zero credits", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const invalidProduct = { ...TestProducts.SELLABLE_BASIC, credits: 0 }
        const result = yield* repo.createCreditLot(TestUsers.USER_1, invalidProduct, {
          operation_type: "test_operation"
        }).pipe(Effect.flip)

        expect(result._tag).toBe("InvalidRequest")
        if (result._tag === "InvalidRequest") {
          expect(result.field).toBe("product")
          expect(result.reason).toBe("invalid_parameters")
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("throws InvalidRequest for missing operation_type", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const result = yield* repo.createCreditLot(TestUsers.USER_1, TestProducts.SELLABLE_BASIC, {
          operation_type: ""
        }).pipe(Effect.flip)

        expect(result._tag).toBe("InvalidRequest")
        if (result._tag === "InvalidRequest") {
          expect(result.field).toBe("context.operation_type")
          expect(result.reason).toBe("invalid_parameters")
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("throws InvalidRequest for negative resource_amount", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const result = yield* repo.createCreditLot(TestUsers.USER_1, TestProducts.SELLABLE_BASIC, {
          operation_type: "test_operation",
          resource_amount: -50
        }).pipe(Effect.flip)

        expect(result._tag).toBe("InvalidRequest")
        if (result._tag === "InvalidRequest") {
          expect(result.field).toBe("context.resource_amount")
          expect(result.reason).toBe("invalid_amount")
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("recordDebit validation errors", () => {
    it("throws InvalidRequest for empty user_id", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const result = yield* repo.recordDebit("", {
          operation_type: "test_operation",
          amount: 25
        }, {
          lot_id: "test-lot",
          lot_month: "2025-01-01"
        }).pipe(Effect.flip)

        expect(result._tag).toBe("InvalidRequest")
        if (result._tag === "InvalidRequest") {
          expect(result.field).toBe("user_id")
          expect(result.reason).toBe("invalid_parameters")
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("throws InvalidRequest for zero debit amount", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const result = yield* repo.recordDebit(TestUsers.USER_1, {
          operation_type: "test_operation",
          amount: 0
        }, {
          lot_id: "test-lot",
          lot_month: "2025-01-01"
        }).pipe(Effect.flip)

        expect(result._tag).toBe("InvalidRequest")
        if (result._tag === "InvalidRequest") {
          expect(result.field).toBe("context.amount")
          expect(result.reason).toBe("invalid_amount")
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("throws InvalidRequest for missing lot_id", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const result = yield* repo.recordDebit(TestUsers.USER_1, {
          operation_type: "test_operation",
          amount: 25
        }, {
          lot_id: "",
          lot_month: "2025-01-01"
        }).pipe(Effect.flip)

        expect(result._tag).toBe("InvalidRequest")
        if (result._tag === "InvalidRequest") {
          expect(result.field).toBe("target")
          expect(result.reason).toBe("invalid_parameters")
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getUserBalance validation errors", () => {
    it("throws InvalidRequest for empty user_id", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const result = yield* repo.getUserBalance("")
          .pipe(Effect.flip)

        expect(result._tag).toBe("InvalidRequest")
        if (result._tag === "InvalidRequest") {
          expect(result.field).toBe("user_id")
          expect(result.reason).toBe("invalid_parameters")
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getLotBalance validation errors", () => {
    it("throws InvalidRequest for empty lot_id", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const result = yield* repo.getLotBalance("", "2025-01-01")
          .pipe(Effect.flip)

        expect(result._tag).toBe("InvalidRequest")
        if (result._tag === "InvalidRequest") {
          expect(result.field).toBe("lot_reference")
          expect(result.reason).toBe("invalid_parameters")
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("throws InvalidRequest for invalid lot_month format", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const result = yield* repo.getLotBalance("test-lot", "2025-01")
          .pipe(Effect.flip)

        expect(result._tag).toBe("InvalidRequest")
        if (result._tag === "InvalidRequest") {
          expect(result.field).toBe("lot_month")
          expect(result.reason).toBe("format_violation")
          expect(result.details).toContain("YYYY-MM-01")
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getActiveLots validation errors", () => {
    it("throws InvalidRequest for empty user_id", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const result = yield* repo.getActiveLots("")
          .pipe(Effect.flip)

        expect(result._tag).toBe("InvalidRequest")
        if (result._tag === "InvalidRequest") {
          expect(result.field).toBe("user_id")
          expect(result.reason).toBe("invalid_parameters")
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getOldestActiveLot validation errors", () => {
    it("throws InvalidRequest for empty user_id", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const result = yield* repo.getOldestActiveLot("")
          .pipe(Effect.flip)

        expect(result._tag).toBe("InvalidRequest")
        if (result._tag === "InvalidRequest") {
          expect(result.field).toBe("user_id")
          expect(result.reason).toBe("invalid_parameters")
        }
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })
})
