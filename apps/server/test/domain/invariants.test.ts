import { Schema } from "@effect/schema"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { LedgerEntryValidated } from "@server/domain/credit-ledger/entities/LedgerEntry.js"
import { OperationValidated } from "@server/domain/operations/entities/Operation.js"
import { ProductValidated } from "@server/domain/products/entities/Product.js"
import { createMonthDate } from "@server/domain/shared/values/MonthDate.js"

describe("Domain invariants", () => {
  describe("LedgerEntry issuance/debit rules", () => {
    it("accepts a valid issuance (amount > 0) with required fields and identity rules", () => {
      const createdAt = "2025-01-15T12:00:00.000Z"
      const createdMonth = createMonthDate(new Date(createdAt))
      const id = "5dcf7ca7-0e73-4e8f-9b9e-2a3f7c1f0d77"

      const input = {
        entry_id: id,
        user_id: "user-1",
        lot_id: id, // lot_id must equal entry_id for issuance
        lot_month: createdMonth, // lot_month must equal created_month for issuance
        amount: 10,
        reason: "purchase",
        operation_type: "payment_card",
        resource_amount: 99.99,
        resource_unit: "USD",
        workflow_id: "wf-123",
        product_code: "PROD_A",
        expires_at: "2025-02-15T00:00:00.000Z",
        created_at: createdAt,
        created_month: createdMonth
      }

      const result = Effect.runSync(Effect.either(Schema.decodeUnknown(LedgerEntryValidated)(input)))
      if (result._tag === "Left") console.error("Issuance decode error:", String(result.left))
      expect(result._tag).toBe("Right")
    })

    it("rejects issuance missing product_code or expires_at", () => {
      const createdAt = "2025-01-15T12:00:00.000Z"
      const createdMonth = createMonthDate(new Date(createdAt))
      const id = "5dcf7ca7-0e73-4e8f-9b9e-2a3f7c1f0d77"

      const missingProduct = {
        entry_id: id,
        user_id: "user-1",
        lot_id: id,
        lot_month: createdMonth,
        amount: 5,
        reason: "welcome",
        operation_type: "grant",
        expires_at: "2025-02-15T00:00:00.000Z",
        created_at: createdAt,
        created_month: createdMonth
      }

      const missingExpiry = {
        ...missingProduct,
        product_code: "GRANT_A",
        expires_at: undefined
      }

      const res1 = Effect.runSync(Effect.either(Schema.decodeUnknown(LedgerEntryValidated)(missingProduct)))
      const res2 = Effect.runSync(Effect.either(Schema.decodeUnknown(LedgerEntryValidated)(missingExpiry)))
      expect(res1._tag).toBe("Left")
      expect(res2._tag).toBe("Left")
    })

    it("rejects issuance when lot_id != entry_id or lot_month != created_month", () => {
      const createdAt = "2025-03-10T12:00:00.000Z"
      const createdMonth = createMonthDate(new Date(createdAt))
      const id = "5dcf7ca7-0e73-4e8f-9b9e-2a3f7c1f0d77"

      const badIdentity = {
        entry_id: id,
        user_id: "user-1",
        lot_id: "b27c1c83-83a2-4a03-9c7d-69d3b2c9e111", // should equal entry_id
        lot_month: createdMonth,
        amount: 7,
        reason: "adjustment",
        operation_type: "manual_adjustment",
        product_code: "ADJ_1",
        expires_at: "2025-04-10T00:00:00.000Z",
        created_at: createdAt,
        created_month: createdMonth
      }

      const badLotMonth = {
        ...badIdentity,
        lot_id: id,
        lot_month: "2025-04-01"
      }

      const res3 = Effect.runSync(Effect.either(Schema.decodeUnknown(LedgerEntryValidated)(badIdentity)))
      const res4 = Effect.runSync(Effect.either(Schema.decodeUnknown(LedgerEntryValidated)(badLotMonth)))
      expect(res3._tag).toBe("Left")
      expect(res4._tag).toBe("Left")
    })

    it("accepts a valid debit (amount < 0) with product_code/expires_at absent", () => {
      const createdAt = "2025-01-20T12:00:00.000Z"
      const createdMonth = createMonthDate(new Date(createdAt))
      const lotId = "1c8f7e93-cdb5-4194-b5b5-2c1b28a3f0ad"

      const input = {
        entry_id: "6a5d5b19-3e4b-49ed-9a10-9d5b2532e2bd",
        user_id: "user-1",
        lot_id: lotId, // references issuance entry
        lot_month: createdMonth,
        amount: -3,
        reason: "debit",
        operation_type: "api_call",
        resource_amount: 3,
        resource_unit: "REQUEST",
        workflow_id: "wf-456",
        product_code: null,
        expires_at: null,
        created_at: createdAt,
        created_month: createdMonth
      }

      const result = Effect.runSync(Effect.either(Schema.decodeUnknown(LedgerEntryValidated)(input)))
      if (result._tag === "Left") console.error("Debit decode error:", String(result.left))
      expect(result._tag).toBe("Right")
    })

    it("rejects a debit when product_code/expires_at are present", () => {
      const createdAt = "2025-01-20T12:00:00.000Z"
      const createdMonth = createMonthDate(new Date(createdAt))

      const invalidDebit = {
        entry_id: "6a5d5b19-3e4b-49ed-9a10-9d5b2532e2bd",
        user_id: "user-1",
        lot_id: "1c8f7e93-cdb5-4194-b5b5-2c1b28a3f0ad",
        lot_month: createdMonth,
        amount: -2,
        reason: "debit",
        operation_type: "api_call",
        product_code: "SHOULD_NOT_BE_SET",
        expires_at: "2025-02-01T00:00:00.000Z",
        created_at: createdAt,
        created_month: createdMonth
      }

      const res5 = Effect.runSync(Effect.either(Schema.decodeUnknown(LedgerEntryValidated)(invalidDebit)))
      expect(res5._tag).toBe("Left")
    })
  })

  describe("Operation expiry-after-open", () => {
    it("accepts expires_at > opened_at", () => {
      const input = {
        operation_id: "a5d5b19b-3e4b-49ed-9a10-9d5b2532e2bd",
        user_id: "user-1",
        operation_type_code: "api_call",
        captured_rate: 1.5,
        status: "open",
        opened_at: "2025-01-01T00:00:00.000Z",
        expires_at: "2025-01-02T00:00:00.000Z",
        workflow_id: null,
        closed_at: null
      }
      const result = Effect.runSync(Effect.either(Schema.decodeUnknown(OperationValidated)(input)))
      if (result._tag === "Left") console.error("Operation decode error:", String(result.left))
      expect(result._tag).toBe("Right")
    })

    it("rejects expires_at <= opened_at", () => {
      const invalid = {
        operation_id: "a5d5b19b-3e4b-49ed-9a10-9d5b2532e2bd",
        user_id: "user-1",
        operation_type_code: "api_call",
        captured_rate: 1.5,
        status: "open",
        opened_at: "2025-01-02T00:00:00.000Z",
        expires_at: "2025-01-02T00:00:00.000Z"
      }
      const res6 = Effect.runSync(Effect.either(Schema.decodeUnknown(OperationValidated)(invalid)))
      expect(res6._tag).toBe("Left")
    })
  })

  describe("Product grant-policy rule", () => {
    it("accepts grant distribution with grant_policy", () => {
      const input = {
        product_code: "GRANT_1",
        title: "Welcome Bonus",
        credits: 10,
        access_period_days: 30,
        distribution: "grant",
        grant_policy: "manual_grant",
        effective_at: "2025-01-01T00:00:00.000Z",
        archived_at: null,
        price_rows: null
      }
      const result = Effect.runSync(Effect.either(Schema.decodeUnknown(ProductValidated)(input)))
      if (result._tag === "Left") console.error("Product decode error:", String(result.left))
      expect(result._tag).toBe("Right")
    })

    it("rejects grant distribution without grant_policy", () => {
      const invalid = {
        product_code: "GRANT_2",
        title: "Welcome Bonus",
        credits: 10,
        access_period_days: 30,
        distribution: "grant",
        effective_at: "2025-01-01T00:00:00.000Z",
        archived_at: null,
        price_rows: null
      }
      const res7 = Effect.runSync(Effect.either(Schema.decodeUnknown(ProductValidated)(invalid)))
      expect(res7._tag).toBe("Left")
    })

    it("rejects sellable distribution with grant_policy present", () => {
      const invalid = {
        product_code: "PROD_1",
        title: "Starter Pack",
        credits: 10,
        access_period_days: 30,
        distribution: "sellable",
        grant_policy: "manual_grant",
        effective_at: "2025-01-01T00:00:00.000Z",
        archived_at: null,
        price_rows: null
      }
      const res8 = Effect.runSync(Effect.either(Schema.decodeUnknown(ProductValidated)(invalid)))
      expect(res8._tag).toBe("Left")
    })
  })
})
