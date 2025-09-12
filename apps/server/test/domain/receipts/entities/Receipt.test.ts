import { Receipt, ValidatedReceipt } from "@server/domain/receipts/entities/Receipt.js"
import { createMonthDate } from "@server/domain/shared/values/MonthDate.js"
import { Schema } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { expectLeft, expectRight, runTestEffect } from "../../../utils/effect-helpers.js"

describe("Receipt Entity", () => {
  const validReceiptData = {
    receipt_id: "123e4567-e89b-12d3-a456-426614174000",
    user_id: "user-123",
    lot_id: "456e7890-e89b-12d3-a456-426614174001",
    lot_created_month: createMonthDate(new Date("2025-01-15")),
    receipt_number: "R-AM-2025-0001",
    issued_at: "2025-01-15T12:00:00.000Z",
    purchase_snapshot: {
      product_code: "BASIC_PACK",
      product_title: "Basic Credit Package",
      amount: 99.99,
      currency: "USD",
      external_ref: "pay_123abc",
      country: "US"
    },
    merchant_config_snapshot: {
      merchant_id: "merchant-123",
      legal_name: "Test Company LLC",
      registered_address: "123 Main St, Test City, TC 12345",
      tax_regime: "vat",
      vat_rate: 0.21
    }
  }

  describe("Entity Creation and Validation", () => {
    it("creates valid receipt from complete data", () => {
      const result = runTestEffect(Schema.decodeUnknown(Receipt)(validReceiptData))
      const receipt = expectRight(result)

      expect(receipt.receipt_id).toBe("123e4567-e89b-12d3-a456-426614174000")
      expect(receipt.user_id).toBe(validReceiptData.user_id)
      expect(receipt.receipt_number).toBe("R-AM-2025-0001")
      expect(receipt.getPurchaseAmount()).toBe(99.99)
      expect(receipt.getPurchaseCurrency()).toBe("USD")
    })

    it("validates required UUID fields", () => {
      const invalidData = { ...validReceiptData, receipt_id: "not-a-uuid" }
      const result = runTestEffect(Schema.decodeUnknown(Receipt)(invalidData))
      expectLeft(result)
    })

    it("validates receipt_number is non-empty", () => {
      const invalidData = { ...validReceiptData, receipt_number: "" }
      const result = runTestEffect(Schema.decodeUnknown(Receipt)(invalidData))
      expectLeft(result)
    })

    it("validates issued_at is a valid date", () => {
      const invalidData = { ...validReceiptData, issued_at: "not-a-date" }
      const result = runTestEffect(Schema.decodeUnknown(Receipt)(invalidData))
      expectLeft(result)
    })
  })

  describe("Business Logic Methods", () => {
    let receipt: Receipt

    beforeEach(() => {
      const result = runTestEffect(Schema.decodeUnknown(Receipt)(validReceiptData))
      receipt = expectRight(result)
    })

    it("isValidReceipt returns true for complete receipt", () => {
      expect(receipt.isValidReceipt()).toBe(true)
    })

    it("isValidReceipt returns false for receipt with missing purchase data", () => {
      const invalidData = {
        ...validReceiptData,
        purchase_snapshot: { product_code: "BASIC" } // Missing required fields
      }
      const result = runTestEffect(Schema.decodeUnknown(Receipt)(invalidData))
      const invalidReceipt = expectRight(result)

      expect(invalidReceipt.isValidReceipt()).toBe(false)
    })

    it("extracts purchase information correctly", () => {
      expect(receipt.getPurchaseAmount()).toBe(99.99)
      expect(receipt.getPurchaseCurrency()).toBe("USD")
      expect(receipt.getProductCode()).toBe("BASIC_PACK")
    })

    it("extracts merchant information correctly", () => {
      expect(receipt.getMerchantLegalName()).toBe("Test Company LLC")
    })

    it("extracts receipt sequence number", () => {
      expect(receipt.getReceiptSequenceNumber()).toBe("0001")
    })

    it("generates PDF-ready data structure", () => {
      const pdfData = receipt.toPdfData()

      expect(pdfData.receiptNumber).toBe("R-AM-2025-0001")
      expect(pdfData.issuedAt).toEqual(new Date("2025-01-15T12:00:00Z"))
      expect(pdfData.purchase.productCode).toBe("BASIC_PACK")
      expect(pdfData.purchase.amount).toBe(99.99)
      expect(pdfData.purchase.currency).toBe("USD")
      expect(pdfData.merchant.legalName).toBe("Test Company LLC")
      expect(pdfData.merchant.taxRegime).toBe("vat")
    })
  })

  describe("Business Rule Validation", () => {
    it("ValidatedReceipt accepts receipt with complete purchase snapshot", () => {
      const result = runTestEffect(Schema.decodeUnknown(ValidatedReceipt)(validReceiptData))
      expectRight(result)
    })

    it("ValidatedReceipt rejects receipt with incomplete purchase snapshot", () => {
      const invalidData = {
        ...validReceiptData,
        purchase_snapshot: {
          product_code: "BASIC" // Missing amount and currency
        }
      }

      const result = runTestEffect(Schema.decodeUnknown(ValidatedReceipt)(invalidData))
      expectLeft(result)
    })

    it("ValidatedReceipt rejects receipt with zero amount", () => {
      const invalidData = {
        ...validReceiptData,
        purchase_snapshot: {
          ...validReceiptData.purchase_snapshot,
          amount: 0 // Invalid amount
        }
      }

      const result = runTestEffect(Schema.decodeUnknown(ValidatedReceipt)(invalidData))
      expectLeft(result)
    })

    it("ValidatedReceipt rejects receipt with negative amount", () => {
      const invalidData = {
        ...validReceiptData,
        purchase_snapshot: {
          ...validReceiptData.purchase_snapshot,
          amount: -10.50 // Invalid amount
        }
      }

      const result = runTestEffect(Schema.decodeUnknown(ValidatedReceipt)(invalidData))
      expectLeft(result)
    })
  })

  describe("JSONB Field Handling", () => {
    it("handles complex purchase snapshot structures", () => {
      const complexData = {
        ...validReceiptData,
        purchase_snapshot: {
          product_code: "PREMIUM",
          product_title: "Premium Package",
          amount: 199.99,
          currency: "EUR",
          external_ref: "stripe_pi_123",
          country: "DE",
          tax_breakdown: {
            type: "vat",
            rate: 0.19,
            amount: 31.93,
            note: "Standard VAT rate for Germany"
          },
          metadata: {
            source: "web_checkout",
            campaign_id: "spring_2025"
          }
        }
      }

      const result = runTestEffect(Schema.decodeUnknown(Receipt)(complexData))
      const receipt = expectRight(result)

      expect(receipt.getPurchaseAmount()).toBe(199.99)
      expect(receipt.getPurchaseCurrency()).toBe("EUR")

      const pdfData = receipt.toPdfData()
      expect(pdfData.purchase.amount).toBe(199.99)
      expect(pdfData.purchase.currency).toBe("EUR")
    })

    it("handles complex merchant config snapshots", () => {
      const complexData = {
        ...validReceiptData,
        merchant_config_snapshot: {
          merchant_id: "merchant-de-123",
          legal_name: "Test GmbH",
          registered_address: "Musterstraße 123, 10115 Berlin, Germany",
          tax_regime: "vat",
          vat_number: "DE123456789",
          vat_rate: 0.19,
          business_license: "HRB 12345",
          contact: {
            email: "info@test.de",
            phone: "+49 30 12345678"
          }
        }
      }

      const result = runTestEffect(Schema.decodeUnknown(Receipt)(complexData))
      const receipt = expectRight(result)

      expect(receipt.getMerchantLegalName()).toBe("Test GmbH")

      const pdfData = receipt.toPdfData()
      expect(pdfData.merchant.legalName).toBe("Test GmbH")
      expect(pdfData.merchant.address).toBe("Musterstraße 123, 10115 Berlin, Germany")
    })
  })
})
