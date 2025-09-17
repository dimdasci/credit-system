import { LedgerRepository } from "@server/services/repositories/LedgerRepository.js"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { TestDates, TestLotSummaries, TestUsers } from "../../fixtures/ledger-test-data.js"
import { resetMockQueryContext, TestLayer } from "./helpers/ledger-repository-test-harness.js"

describe("LedgerRepository lot projections", () => {
  beforeEach(() => resetMockQueryContext())

  describe("getActiveLots", () => {
    it("returns only non-expired lots with positive balance", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const activeLots = yield* repo.getActiveLots(TestUsers.USER_1, TestDates.JAN_EARLY_2025)

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

        expect(expiredLots.length).toBeGreaterThan(0)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })

  describe("getLotById", () => {
    it("returns issuance entry for existing lot", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const lot = yield* repo.getLotById(
          TestLotSummaries.PURCHASE_LOT_1_SUMMARY.lot_id,
          TestLotSummaries.PURCHASE_LOT_1_SUMMARY.lot_month
        )

        expect(lot).not.toBeNull()
        expect(lot?.entry_id).toBe(TestLotSummaries.PURCHASE_LOT_1_SUMMARY.lot_id)
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

  describe("selectFIFOLots", () => {
    it("returns minimal lot list covering required credits", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const lots = yield* repo.selectFIFOLots(TestUsers.USER_1, 60, TestDates.JAN_EARLY_2025)

        expect(lots).toHaveLength(1)
        expect(lots[0]?.entry_id).toBe(TestLotSummaries.PURCHASE_LOT_1_SUMMARY.lot_id)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))

    it("includes additional lots when required credits exceed first lot", () =>
      Effect.gen(function*() {
        const repo = yield* LedgerRepository
        const lots = yield* repo.selectFIFOLots(TestUsers.USER_1, 200, TestDates.JAN_EARLY_2025)

        expect(lots.length).toBeGreaterThan(1)
        const lotIds = lots.map((lot) => lot.entry_id)
        expect(lotIds).toContain(TestLotSummaries.PURCHASE_LOT_1_SUMMARY.lot_id)
        expect(lotIds).toContain(TestLotSummaries.WELCOME_LOT_1_SUMMARY.lot_id)
      }).pipe(Effect.provide(TestLayer), Effect.runPromise))
  })
})
