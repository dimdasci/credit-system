import { MerchantContext } from "@credit-system/shared"
import type { MerchantContext as MerchantContextType } from "@credit-system/shared"
import { Layer } from "effect"

// Test MerchantContext implementation
export class TestMerchantContext implements MerchantContextType {
  readonly merchantId: string
  constructor(merchantId = "test-merchant-123") {
    this.merchantId = merchantId
  }
}

// Layer for test dependency injection
export const TestMerchantContextLive = Layer.succeed(
  MerchantContext,
  new TestMerchantContext()
)
