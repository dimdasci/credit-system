import type { Product } from "@server/domain/products/Product.js"
import type { Receipt } from "@server/domain/receipts/Receipt.js"
import type { PricingSnapshot, SettlementRequest } from "@server/services/business/PurchaseSettlementService.js"

export const TestUsers = {
  USER_1: "user-1-new-purchase",
  USER_2: "user-2-duplicate-purchase",
  USER_3: "user-3-pricing-changed",
  USER_4: "user-4-connection-error"
} as const

export const TestProducts = {
  BASIC_PLAN: {
    product_code: "basic-plan-v1",
    title: "Basic Plan",
    credits: 1000,
    access_period_days: 30,
    distribution: "sellable" as const,
    grant_policy: null,
    effective_at: "2025-01-01T00:00:00Z",
    archived_at: null,
    price_rows: [
      {
        product_code: "basic-plan-v1",
        country: "US",
        currency: "USD",
        amount: 9.99,
        vat_info: { rate: 0.0825, amount: 0.82, note: "Sales tax" }
      },
      {
        product_code: "basic-plan-v1",
        country: "*",
        currency: "USD",
        amount: 9.99,
        vat_info: null
      }
    ]
  },
  ARCHIVED_PLAN: {
    product_code: "old-plan-v1",
    title: "Old Plan (Archived)",
    credits: 500,
    access_period_days: 30,
    distribution: "sellable" as const,
    grant_policy: null,
    effective_at: "2024-01-01T00:00:00Z",
    archived_at: "2025-01-01T00:00:00Z",
    price_rows: [
      {
        product_code: "old-plan-v1",
        country: "*",
        currency: "USD",
        amount: 5.99,
        vat_info: null
      }
    ]
  },
  NO_COUNTRY_PLAN: {
    product_code: "restricted-plan-v1",
    title: "Restricted Plan",
    credits: 2000,
    access_period_days: 60,
    distribution: "sellable" as const,
    grant_policy: null,
    effective_at: "2025-01-01T00:00:00Z",
    archived_at: null,
    price_rows: [
      {
        product_code: "restricted-plan-v1",
        country: "US",
        currency: "USD",
        amount: 19.99,
        vat_info: null
      }
      // Note: No fallback "*" country, so only available in US
    ]
  }
} as const

export const TestPricingSnapshots = {
  VALID_US_PRICING: {
    country: "US",
    currency: "USD",
    amount: 9.99,
    tax_breakdown: { rate: 0.0825, amount: 0.82, note: "Sales tax" }
  } as PricingSnapshot,
  VALID_FALLBACK_PRICING: {
    country: "CA",
    currency: "USD",
    amount: 9.99
  } as PricingSnapshot,
  CHANGED_PRICING: {
    country: "US",
    currency: "USD",
    amount: 12.99, // Price changed since checkout
    tax_breakdown: { rate: 0.0825, amount: 1.07, note: "Sales tax" }
  } as PricingSnapshot,
  UNAVAILABLE_COUNTRY: {
    country: "FR",
    currency: "EUR",
    amount: 8.99
  } as PricingSnapshot
} as const

export const TestSettlementRequests = {
  VALID_NEW_PURCHASE: {
    user_id: TestUsers.USER_1,
    product_code: TestProducts.BASIC_PLAN.product_code,
    pricing_snapshot: TestPricingSnapshots.VALID_US_PRICING,
    order_placed_at: new Date("2025-03-10T10:00:00Z"),
    external_ref: "external-ref-12345",
    settled_at: new Date("2025-03-10T10:05:00Z")
  } as SettlementRequest,
  DUPLICATE_EXTERNAL_REF: {
    user_id: TestUsers.USER_2,
    product_code: TestProducts.BASIC_PLAN.product_code,
    pricing_snapshot: TestPricingSnapshots.VALID_US_PRICING,
    order_placed_at: new Date("2025-03-10T10:00:00Z"),
    external_ref: "external-ref-duplicate", // This will be in existingExternalRefs
    settled_at: new Date("2025-03-10T10:05:00Z")
  } as SettlementRequest,
  DUPLICATE_EXTERNAL_REF_MISMATCH: {
    user_id: TestUsers.USER_3,
    product_code: TestProducts.BASIC_PLAN.product_code,
    pricing_snapshot: TestPricingSnapshots.VALID_US_PRICING,
    order_placed_at: new Date("2025-03-10T10:00:00Z"),
    external_ref: "external-ref-duplicate",
    settled_at: new Date("2025-03-10T10:05:00Z")
  } as SettlementRequest,
  PRODUCT_NOT_FOUND: {
    user_id: TestUsers.USER_1,
    product_code: "non-existent-plan",
    pricing_snapshot: TestPricingSnapshots.VALID_US_PRICING,
    order_placed_at: new Date("2025-03-10T10:00:00Z"),
    external_ref: "external-ref-not-found",
    settled_at: new Date("2025-03-10T10:05:00Z")
  } as SettlementRequest,
  ARCHIVED_PRODUCT: {
    user_id: TestUsers.USER_1,
    product_code: TestProducts.ARCHIVED_PLAN.product_code,
    pricing_snapshot: {
      country: "US",
      currency: "USD",
      amount: 5.99
    },
    order_placed_at: new Date("2025-02-01T10:00:00Z"), // After archival
    external_ref: "external-ref-archived",
    settled_at: new Date("2025-02-01T10:05:00Z")
  } as SettlementRequest,
  PRICING_CHANGED: {
    user_id: TestUsers.USER_3,
    product_code: TestProducts.BASIC_PLAN.product_code,
    pricing_snapshot: TestPricingSnapshots.CHANGED_PRICING,
    order_placed_at: new Date("2025-03-10T10:00:00Z"),
    external_ref: "external-ref-price-changed",
    settled_at: new Date("2025-03-10T10:05:00Z")
  } as SettlementRequest,
  UNAVAILABLE_COUNTRY: {
    user_id: TestUsers.USER_1,
    product_code: TestProducts.NO_COUNTRY_PLAN.product_code,
    pricing_snapshot: TestPricingSnapshots.UNAVAILABLE_COUNTRY,
    order_placed_at: new Date("2025-03-10T10:00:00Z"),
    external_ref: "external-ref-unavailable-country",
    settled_at: new Date("2025-03-10T10:05:00Z")
  } as SettlementRequest,
  CONNECTION_ERROR: {
    user_id: "CONNECTION_ERROR", // This triggers connection error in test harness
    product_code: TestProducts.BASIC_PLAN.product_code,
    pricing_snapshot: TestPricingSnapshots.VALID_US_PRICING,
    order_placed_at: new Date("2025-03-10T10:00:00Z"),
    external_ref: "external-ref-connection-error",
    settled_at: new Date("2025-03-10T10:05:00Z")
  } as SettlementRequest,
  TIMEOUT_ERROR: {
    user_id: "TIMEOUT_ERROR", // This triggers timeout error in test harness
    product_code: TestProducts.BASIC_PLAN.product_code,
    pricing_snapshot: TestPricingSnapshots.VALID_US_PRICING,
    order_placed_at: new Date("2025-03-10T10:00:00Z"),
    external_ref: "external-ref-timeout",
    settled_at: new Date("2025-03-10T10:05:00Z")
  } as SettlementRequest,
  INVALID_USER_ID: {
    user_id: "", // Invalid empty user_id
    product_code: TestProducts.BASIC_PLAN.product_code,
    pricing_snapshot: TestPricingSnapshots.VALID_US_PRICING,
    order_placed_at: new Date("2025-03-10T10:00:00Z"),
    external_ref: "external-ref-invalid-user",
    settled_at: new Date("2025-03-10T10:05:00Z")
  } as SettlementRequest
} as const

const EXISTING_LOT_ID = "11111111-1111-1111-1111-111111111111"
const EXISTING_RECEIPT_ID = "22222222-2222-2222-2222-222222222222"

export const TestSettlementData = {
  products: [
    TestProducts.BASIC_PLAN as Product.Encoded,
    TestProducts.ARCHIVED_PLAN as Product.Encoded,
    TestProducts.NO_COUNTRY_PLAN as Product.Encoded
  ],

  // Existing receipts for idempotency testing
  existingReceipts: [
    {
      receipt_id: EXISTING_RECEIPT_ID,
      user_id: TestUsers.USER_2,
      lot_id: EXISTING_LOT_ID,
      lot_created_month: "2025-03-01",
      receipt_number: "R-AM-2025-0001",
      issued_at: "2025-03-01T10:00:00Z",
      purchase_snapshot: {
        product_code: TestProducts.BASIC_PLAN.product_code,
        product_title: TestProducts.BASIC_PLAN.title,
        external_ref: "external-ref-duplicate",
        country: "US",
        currency: "USD",
        amount: 9.99,
        tax_breakdown: TestPricingSnapshots.VALID_US_PRICING.tax_breakdown
      },
      merchant_config_snapshot: {
        merchant_id: "test-merchant-id",
        legal_name: "Test Company LLC",
        receipt_series_prefix: "R-AM"
      }
    } as Receipt.Encoded
  ],

  existingLedgerEntries: [
    {
      entry_id: EXISTING_LOT_ID,
      user_id: TestUsers.USER_2,
      lot_id: EXISTING_LOT_ID,
      lot_month: "2025-03-01",
      amount: 1000,
      reason: "purchase",
      operation_type: "payment_settlement",
      resource_amount: 9.99,
      resource_unit: "USD",
      workflow_id: "external-ref-duplicate",
      product_code: TestProducts.BASIC_PLAN.product_code,
      expires_at: "2025-04-01T10:00:00Z",
      created_at: "2025-03-01T10:00:00Z",
      created_month: "2025-03-01"
    }
  ],

  // External refs that already exist (for idempotency testing)
  existingExternalRefs: [
    "external-ref-duplicate"
  ]
} as const

export const SettlementFixtureIds = {
  EXISTING_LOT_ID,
  EXISTING_RECEIPT_ID
} as const
