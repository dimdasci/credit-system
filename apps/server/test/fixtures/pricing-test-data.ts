export const PricingTestProducts = [
  // Sellable product with country-specific + fallback pricing
  {
    product_code: "basic-plan-v1",
    title: "Basic Plan",
    credits: 1000,
    access_period_days: 30,
    distribution: "sellable",
    grant_policy: null,
    effective_at: "2025-01-01T00:00:00Z",
    archived_at: null,
    price_rows: [
      {
        product_code: "basic-plan-v1",
        country: "US",
        currency: "USD",
        amount: 9.99,
        vat_info: null
      },
      {
        product_code: "basic-plan-v1",
        country: "*", // Fallback pricing
        currency: "USD",
        amount: 9.99,
        vat_info: null
      }
    ]
  },

  // Archived product
  {
    product_code: "archived-plan-v1",
    title: "Archived Plan",
    credits: 500,
    access_period_days: 30,
    distribution: "sellable",
    grant_policy: null,
    effective_at: "2024-01-01T00:00:00Z",
    archived_at: "2025-01-01T00:00:00Z", // Archived
    price_rows: [
      {
        product_code: "archived-plan-v1",
        country: "US",
        currency: "USD",
        amount: 4.99,
        vat_info: null
      }
    ]
  },

  // Grant product (no pricing)
  {
    product_code: "welcome-grant",
    title: "Welcome Grant",
    credits: 100,
    access_period_days: 30,
    distribution: "grant",
    grant_policy: "apply_on_signup",
    effective_at: "2025-01-01T00:00:00Z",
    archived_at: null,
    price_rows: null // Grant products have no pricing
  },

  // Product with no fallback pricing (restricted availability)
  {
    product_code: "restricted-plan-v1",
    title: "Restricted Plan",
    credits: 2000,
    access_period_days: 30,
    distribution: "sellable",
    grant_policy: null,
    effective_at: "2025-01-01T00:00:00Z",
    archived_at: null,
    price_rows: [
      {
        product_code: "restricted-plan-v1",
        country: "US", // Only US, no fallback
        currency: "USD",
        amount: 19.99,
        vat_info: null
      }
    ]
  }
] as const

export const PricingTestMerchantConfigs = {
  // German VAT merchant
  VAT_MERCHANT: {
    merchantId: "9327",
    legalName: "Test GmbH",
    registeredAddress: "Berlin, Germany",
    country: "DE",
    taxRegime: "vat" as const,
    vatRate: 0.19,
    receiptSeriesPrefix: "R-DE",
    operationTimeoutMinutes: 30,
    retentionYears: 7
  },

  // US turnover tax merchant
  TURNOVER_MERCHANT: {
    merchantId: "9328",
    legalName: "Test LLC",
    registeredAddress: "New York, USA",
    country: "US",
    taxRegime: "turnover" as const,
    taxStatusNote: "Small business exemption",
    receiptSeriesPrefix: "R-US",
    operationTimeoutMinutes: 30,
    retentionYears: 7
  },

  // Tax-exempt merchant
  EXEMPT_MERCHANT: {
    merchantId: "9329",
    legalName: "Test Foundation",
    registeredAddress: "Zurich, Switzerland",
    country: "CH",
    taxRegime: "none" as const,
    receiptSeriesPrefix: "R-CH",
    operationTimeoutMinutes: 30,
    retentionYears: 7
  }
} as const
