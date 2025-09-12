import { createMonthDate } from "@server/domain/shared/values/MonthDate.js"

// Sample test data organized by business aggregate
export const TestProducts = {
  SELLABLE_BASIC: {
    product_code: "TEST_BASIC",
    title: "Test Basic Package",
    credits: 100,
    access_period_days: 30,
    distribution: "sellable" as const,
    grant_policy: null,
    effective_at: new Date("2025-01-01T00:00:00Z"),
    archived_at: null,
    price_rows: null
  },

  GRANT_WELCOME: {
    product_code: "TEST_WELCOME",
    title: "Test Welcome Grant",
    credits: 50,
    access_period_days: 30,
    distribution: "grant" as const,
    grant_policy: "apply_on_signup" as const,
    effective_at: new Date("2025-01-01T00:00:00Z"),
    archived_at: null,
    price_rows: null
  }
} as const

export const TestUsers = {
  USER_1: "test-user-1",
  USER_2: "test-user-2"
} as const

// Helper to create test ledger entries
export const createTestLedgerEntry = (overrides: Partial<any> = {}) => {
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
