import {
  InsufficientBalance,
  ProductUnavailable,
  ServiceUnavailable
} from "@server/domain/shared/errors/DomainErrors.js"
import { describe, expect, it } from "vitest"

describe("Domain Error Types", () => {
  describe("ProductUnavailable", () => {
    it("creates error with product context", () => {
      const error = new ProductUnavailable({
        product_code: "PROD_123",
        country: "US",
        reason: "not_found"
      })

      expect(error.product_code).toBe("PROD_123")
      expect(error.country).toBe("US")
      expect(error.reason).toBe("not_found")
      expect(error.toString()).toContain("PROD_123")
    })

    it("generates appropriate error messages by reason", () => {
      const notFound = new ProductUnavailable({
        product_code: "PROD_123",
        reason: "not_found"
      })
      expect(notFound.toString()).toContain("not found in catalog")

      const archived = new ProductUnavailable({
        product_code: "PROD_123",
        reason: "archived"
      })
      expect(archived.toString()).toContain("no longer available")
    })
  })

  describe("InsufficientBalance", () => {
    it("creates error with balance context", () => {
      const error = new InsufficientBalance({
        user_id: "user-123",
        current_balance: -5,
        reason: "negative_balance"
      })

      expect(error.user_id).toBe("user-123")
      expect(error.current_balance).toBe(-5)
      expect(error.toString()).toContain("-5 credits")
    })
  })

  describe("ServiceUnavailable", () => {
    it("creates error with service context and retry info", () => {
      const error = new ServiceUnavailable({
        service: "database",
        reason: "database_connection_failure",
        retry_after_seconds: 30
      })

      expect(error.service).toBe("database")
      expect(error.retry_after_seconds).toBe(30)
      expect(error.toString()).toContain("Retry after 30 seconds")
    })
  })
})
