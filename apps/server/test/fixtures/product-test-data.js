import { createMonthDate } from "@server/domain/shared/MonthDate.js"

// Sample test data organized by business aggregate
// Test data in encoded form - as it would appear in the database
export const TestProducts = {
  SELLABLE_BASIC: {
    product_code: "TEST_BASIC",
    title: "Test Basic Package",
    credits: 100,
    access_period_days: 30,
    distribution: "sellable",
    grant_policy: null, // null in DB -> Option.none() in domain
    effective_at: "2025-01-01T00:00:00Z",
    archived_at: null, // null in DB -> Option.none() in domain
    price_rows: null
  },

  GRANT_WELCOME: {
    product_code: "TEST_WELCOME",
    title: "Test Welcome Grant",
    credits: 50,
    access_period_days: 30,
    distribution: "grant",
    grant_policy: "apply_on_signup", // value in DB -> Option.some(value) in domain
    effective_at: "2025-01-01T00:00:00Z",
    archived_at: null,
    price_rows: null
  },

  // Archived product for testing lifecycle
  ARCHIVED_OLD: {
    product_code: "TEST_ARCHIVED",
    title: "Test Archived Product",
    credits: 200,
    access_period_days: 60,
    distribution: "sellable",
    grant_policy: null,
    effective_at: "2024-06-01T00:00:00Z",
    archived_at: "2024-12-01T00:00:00Z", // value in DB -> Option.some(date) in domain
    price_rows: null
  },

  // Future effective product
  FUTURE_PREMIUM: {
    product_code: "TEST_FUTURE",
    title: "Test Future Premium",
    credits: 500,
    access_period_days: 90,
    distribution: "sellable",
    grant_policy: null,
    effective_at: "2026-01-01T00:00:00Z", // Future date
    archived_at: null,
    price_rows: null
  },

  // Manual grant product for testing grant policies
  GRANT_MANUAL: {
    product_code: "TEST_MANUAL_GRANT",
    title: "Test Manual Grant",
    credits: 25,
    access_period_days: 7,
    distribution: "grant",
    grant_policy: "manual_grant", // value in DB -> Option.some(value) in domain
    effective_at: "2025-01-01T00:00:00Z",
    archived_at: null,
    price_rows: null
  }
}

// All test products as array for easy iteration
export const TestProductsArray = Object.values(TestProducts)

export const TestUsers = {
  USER_1: "test-user-1",
  USER_2: "test-user-2"
}

// Helper to create test ledger entries
export const createTestLedgerEntry = (overrides = {}) => {
  const createdAt = new Date("2025-01-15T12:00:00Z")
  const entryId = "test-entry-" + Math.random().toString(36).substring(7)

  return {
    entry_id: entryId,
    user_id: TestUsers.USER_1,
    lot_id: entryId, // Self-reference for issuance entries
    lot_month: createMonthDate(createdAt),
    amount: 100,
    reason: "purchase",
    operation_type: "payment_card",
    resource_amount: 99.99,
    resource_unit: "USD",
    workflow_id: "test-workflow",
    product_code: "TEST_BASIC",
    expires_at: new Date("2025-02-15T00:00:00Z"),
    created_at: createdAt,
    created_month: createMonthDate(createdAt),
    ...overrides
  }
}
