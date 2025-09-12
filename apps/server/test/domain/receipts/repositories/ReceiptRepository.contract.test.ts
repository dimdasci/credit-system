import { ReceiptRepository } from "@server/domain/receipts/repositories/ReceiptRepository.js"
import { describe, expect, it } from "vitest"

describe("ReceiptRepository Contract", () => {
  it("Context tag is properly defined for dependency injection", () => {
    expect(ReceiptRepository.key).toBe("ReceiptRepository")
  })
})
