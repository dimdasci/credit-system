import { LedgerRepository } from "@server/services/repositories/LedgerRepository.js"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { TestLedgerEntries, TestUsers } from "../../fixtures/ledger-test-data.js"
import { resetMockQueryContext, TestLayer } from "./helpers/ledger-repository-test-harness.js"

describe("LedgerRepository balance projections", () => {
  beforeEach(() => {
    resetMockQueryContext()
  })

  describe("getUserBalance", () => {
    it("calculates balance across all partitions for user", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const balance = yield* repo.getUserBalance(TestUsers.USER_1)

        expect(balance).toBe(125)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("returns zero for user with no entries", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const balance = yield* repo.getUserBalance("non-existent-user")

        expect(balance).toBe(0)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getLotBalance", () => {
    it("calculates balance for specific lot across partitions", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const balance = yield* repo.getLotBalance(
          TestLedgerEntries.PURCHASE_LOT_1.lot_id,
          TestLedgerEntries.PURCHASE_LOT_1.lot_month
        )

        expect(balance).toBe(75)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("returns zero for non-existent lot", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const balance = yield* repo.getLotBalance("non-existent-lot", "2025-01-01")

        expect(balance).toBe(0)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getUserLedgerSummary", () => {
    it("calculates comprehensive user ledger statistics", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const summary = yield* repo.getUserLedgerSummary(TestUsers.USER_1)

        expect(summary.total_credits).toBe(150)
        expect(summary.total_debits).toBe(25)
        expect(summary.current_balance).toBe(125)
        expect(summary.active_lots).toBeGreaterThan(0)
        expect(summary.expired_lots).toBeGreaterThanOrEqual(0)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })
})
