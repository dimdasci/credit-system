import { ProductRepository } from "@server/domain/products/repositories/ProductRepository.js"
import { describe, expect, it } from "vitest"

describe("ProductRepository Contract", () => {
  it("Context tag is properly defined for dependency injection", () => {
    expect(ProductRepository.key).toBe("ProductRepository")
  })
})
