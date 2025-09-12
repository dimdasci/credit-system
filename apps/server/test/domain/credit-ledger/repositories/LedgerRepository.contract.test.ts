import { LedgerRepository } from "@server/domain/credit-ledger/repositories/LedgerRepository.js"
import { describe, expect, it } from "vitest"

describe("LedgerRepository Contract", () => {
  it("Context tag is properly defined for dependency injection", () => {
    expect(LedgerRepository.key).toBe("LedgerRepository")
  })
})
