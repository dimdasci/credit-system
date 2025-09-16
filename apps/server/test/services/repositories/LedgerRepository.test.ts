import { MerchantContext } from "@credit-system/shared"
import { DatabaseManager } from "@server/db/DatabaseManager.js"
import { LedgerRepository } from "@server/services/repositories/LedgerRepository.js"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import {
  TestDates,
  TestLedgerEntries,
  TestLedgerEntriesArray,
  TestLotSummaries,
  TestUsers
} from "../../fixtures/ledger-test-data.js"

// Mock DatabaseManager with ledger test data
// Track context for complex partition and lot queries
const mockQueryContext = {
  partition: null as string | null,
  userId: null as string | null,
  atTime: null as Date | null
}

const mockSqlClient = {
  // Mock SQL template literal handler
  [Symbol.for("sql-template")]: true,
  raw: (strings: TemplateStringsArray, ...values: Array<unknown>) => {
    const query = strings.join("?").trim()

    // Handle partition filtering fragment
    if (query.includes("AND created_month >= ?") && values.length === 1) {
      mockQueryContext.partition = values[0] as string
      return Effect.succeed("") // Return empty string for composition
    }

    // Handle user filtering fragment
    if (query === "AND user_id = ?" && values.length === 1) {
      mockQueryContext.userId = values[0] as string
      return Effect.succeed("")
    }

    // Handle empty fragment
    if (query === "" && values.length === 0) {
      return Effect.succeed("")
    }

    // Handle single ledger entry by lot_id and lot_month
    if (
      query.includes("SELECT * FROM ledger_entries") &&
      query.includes("WHERE lot_id = ?") &&
      query.includes("AND lot_month = ?") &&
      query.includes("AND entry_id = lot_id") &&
      query.includes("LIMIT 1")
    ) {
      const lotId = values[0] as string
      const lotMonth = values[1] as string
      const entry = TestLedgerEntriesArray.find((e) =>
        e.lot_id === lotId &&
        e.lot_month === lotMonth &&
        e.entry_id === e.lot_id // Issuance entry
      )
      return Effect.succeed(entry ? [entry] : [])
    }

    // Handle ledger history query - need to match the actual query pattern
    if (
      query.includes("SELECT * FROM ledger_entries") &&
      query.includes("WHERE user_id = ?") &&
      query.includes("ORDER BY created_at DESC") &&
      !query.includes("WITH lot_balances")
    ) {
      const userId = values[0] as string
      const userEntries = TestLedgerEntriesArray
        .filter((e) => e.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      return Effect.succeed(userEntries)
    }

    // Handle user balance calculation across partitions
    if (
      query.includes("SELECT COALESCE(SUM(amount), 0) as balance") &&
      query.includes("FROM ledger_entries") &&
      query.includes("WHERE user_id = ?") &&
      !query.includes("lot_id")
    ) {
      const userId = values[0] as string
      const balance = TestLedgerEntriesArray
        .filter((e) => e.user_id === userId)
        .reduce((sum, e) => sum + e.amount, 0)

      return Effect.succeed([{ balance }])
    }

    // Handle lot balance calculation
    if (
      query.includes("SELECT COALESCE(SUM(amount), 0) as balance") &&
      query.includes("FROM ledger_entries") &&
      query.includes("WHERE lot_id = ? AND lot_month = ?")
    ) {
      const lotId = values[0] as string
      const lotMonth = values[1] as string
      const balance = TestLedgerEntriesArray
        .filter((e) => e.lot_id === lotId && e.lot_month === lotMonth)
        .reduce((sum, e) => sum + e.amount, 0)

      return Effect.succeed([{ balance }])
    }

    // Handle active lots query with balance calculation (CTE)
    if (
      query.includes("WITH lot_balances AS") &&
      query.includes("expires_at > ?") &&
      query.includes("AND balance > 0") &&
      query.includes("ORDER BY issued_at ASC") &&
      !query.includes("LIMIT 1")
    ) {
      const userId = values[0] as string
      const atTime = values[2] as Date // Third value is the filter date

      const activeLots = Object.values(TestLotSummaries).filter((lot) =>
        lot.user_id === userId &&
        lot.expires_at > atTime &&
        lot.current_balance > 0
      )

      return Effect.succeed(activeLots)
    }

    // Handle expired lots query
    if (
      query.includes("WITH lot_balances AS") &&
      query.includes("WHERE expires_at <= ?") &&
      query.includes("AND balance > 0")
    ) {
      const userId = values[0] as string
      const atTime = values[1] as Date

      const expiredLots = Object.values(TestLotSummaries).filter((lot) =>
        lot.user_id === userId &&
        lot.expires_at <= atTime &&
        lot.current_balance > 0
      )

      return Effect.succeed(expiredLots)
    }

    // Handle oldest active lot query (FIFO) - CTE with LIMIT 1
    if (
      query.includes("WITH lot_balances AS") &&
      query.includes("expires_at > ?") &&
      query.includes("AND balance > 0") &&
      query.includes("ORDER BY issued_at ASC") &&
      query.includes("LIMIT 1")
    ) {
      const userId = values[0] as string
      const atTime = values[1] as Date // Second value is the filter date for LIMIT 1 query

      const oldestLot = Object.values(TestLotSummaries)
        .filter((lot) =>
          lot.user_id === userId &&
          lot.expires_at > atTime &&
          lot.current_balance > 0
        )
        .sort((a, b) => a.issued_at.getTime() - b.issued_at.getTime())[0] || null

      return Effect.succeed(oldestLot ? [oldestLot] : [])
    }

    // Handle user ledger summary query
    if (
      query.includes("SELECT") &&
      query.includes("SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_credits") &&
      query.includes("SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_debits") &&
      query.includes("COALESCE(SUM(amount), 0) as current_balance")
    ) {
      const userId = values[0] as string
      const userEntries = TestLedgerEntriesArray.filter((e) => e.user_id === userId)

      const totalCredits = userEntries.filter((e) => e.amount > 0).reduce((sum, e) => sum + e.amount, 0)
      const totalDebits = userEntries.filter((e) => e.amount < 0).reduce((sum, e) => sum + Math.abs(e.amount), 0)
      const currentBalance = userEntries.reduce((sum, e) => sum + e.amount, 0)

      // Count active and expired lots
      const userLots = Object.values(TestLotSummaries).filter((lot) => lot.user_id === userId)
      const activeLots = userLots.filter((lot) => !lot.is_expired).length
      const expiredLots = userLots.filter((lot) => lot.is_expired).length

      return Effect.succeed([{
        total_credits: totalCredits,
        total_debits: totalDebits,
        current_balance: currentBalance,
        active_lots: activeLots,
        expired_lots: expiredLots
      }])
    }

    // Handle INSERT operations
    if (query.includes("INSERT INTO ledger_entries")) {
      return Effect.succeed({ insertId: 1 })
    }

    // Handle batch INSERT operations
    if (query.includes("INSERT INTO ledger_entries") && query.includes("VALUES")) {
      return Effect.succeed({ insertedRows: values.length })
    }

    // Default return for unmatched queries
    return Effect.succeed([])
  }
}

// Proxy to handle template literal syntax
const createMockSql = () => {
  const sqlFunction = (strings: TemplateStringsArray, ...values: Array<unknown>) => {
    return mockSqlClient.raw(strings, ...values)
  }

  // Add properties and support for fragment composition
  Object.assign(sqlFunction, {
    [Symbol.for("sql-template")]: true,
    raw: mockSqlClient.raw
  })

  return sqlFunction as any
}

const MockDatabaseManagerLayer = Layer.succeed(DatabaseManager, {
  getConnection: (_merchantId: string) => Effect.succeed(createMockSql())
})

const MockMerchantContextLayer = Layer.succeed(MerchantContext, {
  merchantId: "test-merchant-id"
})

const TestLayer = Layer.provide(
  Layer.provide(
    LedgerRepository.DefaultWithoutDependencies,
    MockDatabaseManagerLayer
  ),
  MockMerchantContextLayer
)

describe("LedgerRepository Business Logic", () => {
  describe("getLedgerHistory", () => {
    it("returns user ledger entries ordered by creation date", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const history = yield* repo.getLedgerHistory(TestUsers.USER_1)

        expect(history).toHaveLength(3) // PURCHASE_LOT_1, WELCOME_LOT_1, CONSUMPTION_1
        expect(history[0].entry_id).toBe(TestLedgerEntries.CONSUMPTION_1.entry_id) // Most recent
        expect(history[1].entry_id).toBe(TestLedgerEntries.WELCOME_LOT_1.entry_id)
        expect(history[2].entry_id).toBe(TestLedgerEntries.PURCHASE_LOT_1.entry_id) // Oldest
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("returns empty array for user with no entries", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const history = yield* repo.getLedgerHistory("non-existent-user")

        expect(history).toHaveLength(0)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getUserBalance", () => {
    it("calculates balance across all partitions for user", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const balance = yield* repo.getUserBalance(TestUsers.USER_1)

        // USER_1: PURCHASE_LOT_1 (100) + WELCOME_LOT_1 (50) + CONSUMPTION_1 (-25) = 125
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

        // PURCHASE_LOT_1: 100 (issuance) - 25 (consumption) = 75
        expect(balance).toBe(75)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("returns zero for non-existent lot", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const balance = yield* repo.getLotBalance("non-existent-lot", "2025-01-01")

        expect(balance).toBe(0)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getActiveLots", () => {
    it("returns only non-expired lots with positive balance", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const activeLots = yield* repo.getActiveLots(TestUsers.USER_1, TestDates.JAN_EARLY_2025)

        // Should include PURCHASE_LOT_1 and WELCOME_LOT_1 (both expire in Feb 2025)
        // Should exclude EXPIRED_LOT (expired before Jan 2025)
        expect(activeLots).toHaveLength(2)

        const lotIds = activeLots.map((lot) => lot.lot_id)
        expect(lotIds).toContain(TestLotSummaries.PURCHASE_LOT_1_SUMMARY.lot_id)
        expect(lotIds).toContain(TestLotSummaries.WELCOME_LOT_1_SUMMARY.lot_id)
        expect(lotIds).not.toContain(TestLotSummaries.EXPIRED_LOT_SUMMARY.lot_id)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getExpiredLots", () => {
    it("returns expired lots with positive balance", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const expiredLots = yield* repo.getExpiredLots(TestUsers.USER_3, TestDates.FEB_2025)

        // At Feb 2025, EXPIRED_LOT should be included (expired in Jan 2025)
        expect(expiredLots.length).toBeGreaterThan(0)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getLotById", () => {
    it("returns issuance entry for existing lot", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const lot = yield* repo.getLotById(
          TestLedgerEntries.PURCHASE_LOT_1.lot_id,
          TestLedgerEntries.PURCHASE_LOT_1.lot_month
        )

        expect(lot).not.toBeNull()
        expect(lot?.entry_id).toBe(TestLedgerEntries.PURCHASE_LOT_1.entry_id)
        expect(lot?.amount).toBe(100)
        expect(lot?.reason).toBe("purchase")
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("returns null for non-existent lot", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const lot = yield* repo.getLotById("non-existent-lot", "2025-01-01")

        expect(lot).toBeNull()
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getOldestActiveLot", () => {
    it("returns oldest active lot for FIFO consumption", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const oldestLot = yield* repo.getOldestActiveLot(TestUsers.USER_1, TestDates.JAN_EARLY_2025)

        expect(oldestLot).not.toBeNull()
        // Should return either PURCHASE_LOT_1 or WELCOME_LOT_1 based on issued_at
        const expectedLotIds = [
          TestLotSummaries.PURCHASE_LOT_1_SUMMARY.lot_id,
          TestLotSummaries.WELCOME_LOT_1_SUMMARY.lot_id
        ]
        expect(expectedLotIds).toContain(oldestLot?.lot_id)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("returns null when no active lots exist", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const oldestLot = yield* repo.getOldestActiveLot("non-existent-user", TestDates.JAN_EARLY_2025)

        expect(oldestLot).toBeNull()
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getUserLedgerSummary", () => {
    it("calculates comprehensive user ledger statistics", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const summary = yield* repo.getUserLedgerSummary(TestUsers.USER_1)

        expect(summary.total_credits).toBe(150) // 100 + 50 (PURCHASE_LOT_1 + WELCOME_LOT_1)
        expect(summary.total_debits).toBe(25) // abs(-25) (CONSUMPTION_1)
        expect(summary.current_balance).toBe(125) // 150 - 25
        expect(summary.active_lots).toBeGreaterThan(0)
        expect(summary.expired_lots).toBeGreaterThanOrEqual(0)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("Partition handling", () => {
    it("handles entries across multiple month partitions", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository

        // Get balance for USER_2 who has entries in different partition (Feb 2025)
        const balance = yield* repo.getUserBalance(TestUsers.USER_2)

        expect(balance).toBe(200) // PURCHASE_LOT_2 amount
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("Composite foreign key handling", () => {
    it("respects lot_id and lot_month composite references", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository

        // Verify CONSUMPTION_1 correctly references PURCHASE_LOT_1 via composite key
        const lotBalance = yield* repo.getLotBalance(
          TestLedgerEntries.PURCHASE_LOT_1.lot_id,
          TestLedgerEntries.PURCHASE_LOT_1.lot_month
        )

        // Should include both issuance (100) and consumption (-25)
        expect(lotBalance).toBe(75)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })
})
