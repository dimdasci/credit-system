import { LedgerRepository } from "@server/services/repositories/LedgerRepository.js"
import type { LedgerQueryOptions } from "@server/services/repositories/LedgerRepository.js"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { TestDates, TestLedgerEntries, TestUsers } from "../../fixtures/ledger-test-data.js"
import { mockQueryContext, resetMockQueryContext, TestLayer } from "./helpers/ledger-repository-test-harness.js"

describe("LedgerRepository.getLedgerHistory", () => {
  beforeEach(() => {
    resetMockQueryContext()
  })

  it("returns user ledger entries ordered by creation date", () =>
    Effect.gen(function*() {
      const repo = yield* LedgerRepository
      const history = yield* repo.getLedgerHistory(TestUsers.USER_1)

      expect(history).toHaveLength(3)
      expect(history[0].entry_id).toBe(TestLedgerEntries.CONSUMPTION_1.entry_id)
      expect(history[1].entry_id).toBe(TestLedgerEntries.WELCOME_LOT_1.entry_id)
      expect(history[2].entry_id).toBe(TestLedgerEntries.PURCHASE_LOT_1.entry_id)
    }).pipe(Effect.provide(TestLayer), Effect.runPromise))

  it("returns empty array for user with no entries", () =>
    Effect.gen(function*() {
      const repo = yield* LedgerRepository
      const history = yield* repo.getLedgerHistory("non-existent-user")

      expect(history).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer), Effect.runPromise))

  it("applies reason filters when provided", () =>
    Effect.gen(function*() {
      const repo = yield* LedgerRepository
      const options: LedgerQueryOptions = { reasons: ["debit"] }
      mockQueryContext.lastHistoryOptions = options
      const history = yield* repo.getLedgerHistory(TestUsers.USER_1, options)

      expect(history).toHaveLength(1)
      expect(history[0].reason).toBe("debit")
      expect(mockQueryContext.lastAppliedReasonFilter).toEqual(["debit"])
      expect(mockQueryContext.lastHistoryQuery).not.toContain("[object Object]")
      expect(mockQueryContext.lastHistoryValues.length).toBeGreaterThan(1)
    }).pipe(Effect.provide(TestLayer), Effect.runPromise))

  it("projects date range filters onto created_month for partition pruning", () =>
    Effect.gen(function*() {
      const repo = yield* LedgerRepository
      yield* repo.getLedgerHistory(TestUsers.USER_1, {
        fromDate: TestDates.PAST_2024,
        toDate: TestDates.MAR_2025
      })

      expect(mockQueryContext.monthFilters).toContain("2024-12-01")
      expect(mockQueryContext.monthFilters).toContain("2025-03-01")
    }).pipe(Effect.provide(TestLayer), Effect.runPromise))
})
