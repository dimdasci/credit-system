import { OperationRepository } from "@server/domain/operations/repositories/OperationRepository.js"
import { describe, expect, it } from "vitest"

describe("OperationRepository Contract", () => {
  it("Context tag is properly defined for dependency injection", () => {
    expect(OperationRepository.key).toBe("OperationRepository")
  })
})
