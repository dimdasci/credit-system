import { MerchantConfig } from "@server/domain/merchants/MerchantConfig.js"
import { MerchantConfigService } from "@server/services/external/MerchantConfigService.js"
import { Effect, Layer } from "effect"

// Test MerchantConfig for testing
const testMerchantConfig = new MerchantConfig({
  merchantId: "test-merchant-123",
  legalName: "Test Credit System LLC",
  registeredAddress: "123 Test Street, Test City, TC 12345",
  country: "US",
  taxRegime: "vat",
  vatRate: 0.20,
  taxStatusNote: "VAT registered for testing",
  receiptSeriesPrefix: "R-AM",
  operationTimeoutMinutes: 30,
  retentionYears: 7
})

// Test MerchantConfigService implementation
export const TestMerchantConfigServiceLive = Layer.succeed(
  MerchantConfigService,
  {
    _tag: "MerchantConfigService",
    getCurrentMerchantConfig: () => Effect.succeed(testMerchantConfig)
  } as any
)
