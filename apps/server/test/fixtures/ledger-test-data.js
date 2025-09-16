import { createMonthDate } from "@server/domain/shared/MonthDate.js"

// Test users for consistent user IDs across test scenarios
export const TestUsers = {
  USER_1: "test-user-1",
  USER_2: "test-user-2",
  USER_3: "test-user-3"
}

// Test dates for consistent temporal scenarios
export const TestDates = {
  JAN_EARLY_2025: new Date("2025-01-10T12:00:00Z"), // Earlier date for PURCHASE_LOT_1
  JAN_LATE_2025: new Date("2025-01-15T12:00:00Z"), // Later date for WELCOME_LOT_1
  FEB_2025: new Date("2025-02-15T12:00:00Z"),
  MAR_2025: new Date("2025-03-15T12:00:00Z"),
  PAST_2024: new Date("2024-12-15T12:00:00Z"),
  FUTURE_2026: new Date("2026-01-15T12:00:00Z")
}

// Test ledger entries in database-encoded format
export const TestLedgerEntries = {
  // Purchase issuance entry for USER_1 (creates lot)
  PURCHASE_LOT_1: {
    entry_id: "550e8400-e29b-41d4-a716-446655440001",
    user_id: TestUsers.USER_1,
    lot_id: "550e8400-e29b-41d4-a716-446655440001", // Self-reference
    lot_month: "2025-01-01", // createMonthDate(TestDates.JAN_2025)
    amount: 100,
    reason: "purchase",
    operation_type: "payment_card",
    resource_amount: 99.99,
    resource_unit: "USD",
    workflow_id: "workflow-purchase-001",
    product_code: "TEST_BASIC",
    expires_at: "2025-02-15T00:00:00Z",
    created_at: TestDates.JAN_EARLY_2025.toISOString(),
    created_month: "2025-01-01"
  },

  // Welcome grant issuance entry for USER_1 (creates another lot)
  WELCOME_LOT_1: {
    entry_id: "550e8400-e29b-41d4-a716-446655440002",
    user_id: TestUsers.USER_1,
    lot_id: "550e8400-e29b-41d4-a716-446655440002", // Self-reference
    lot_month: "2025-01-01",
    amount: 50,
    reason: "welcome",
    operation_type: "grant_manual",
    resource_amount: null,
    resource_unit: null,
    workflow_id: "workflow-welcome-001",
    product_code: "TEST_WELCOME",
    expires_at: "2025-02-15T00:00:00Z",
    created_at: TestDates.JAN_LATE_2025.toISOString(),
    created_month: "2025-01-01"
  },

  // Debit entry consuming from PURCHASE_LOT_1 (FIFO)
  CONSUMPTION_1: {
    entry_id: "550e8400-e29b-41d4-a716-446655440003",
    user_id: TestUsers.USER_1,
    lot_id: "550e8400-e29b-41d4-a716-446655440001", // References PURCHASE_LOT_1
    lot_month: "2025-01-01", // Lot month from issuance entry
    amount: -25,
    reason: "debit",
    operation_type: "text_generation",
    resource_amount: 1000,
    resource_unit: "tokens",
    workflow_id: "workflow-operation-001",
    product_code: null,
    expires_at: null,
    created_at: TestDates.FEB_2025.toISOString(),
    created_month: "2025-02-01"
  },

  // Purchase for USER_2 in different partition
  PURCHASE_LOT_2: {
    entry_id: "550e8400-e29b-41d4-a716-446655440004",
    user_id: TestUsers.USER_2,
    lot_id: "550e8400-e29b-41d4-a716-446655440004", // Self-reference
    lot_month: "2025-02-01",
    amount: 200,
    reason: "purchase",
    operation_type: "payment_card",
    resource_amount: 199.99,
    resource_unit: "USD",
    workflow_id: "workflow-purchase-002",
    product_code: "TEST_PREMIUM",
    expires_at: "2025-05-15T00:00:00Z",
    created_at: TestDates.FEB_2025.toISOString(),
    created_month: "2025-02-01"
  },

  // Expired lot for testing expiry logic
  EXPIRED_LOT: {
    entry_id: "550e8400-e29b-41d4-a716-446655440005",
    user_id: TestUsers.USER_3, // Change to USER_3 to avoid affecting USER_1 balance test
    lot_id: "550e8400-e29b-41d4-a716-446655440005", // Self-reference
    lot_month: "2024-12-01",
    amount: 75,
    reason: "purchase",
    operation_type: "payment_card",
    resource_amount: 74.99,
    resource_unit: "USD",
    workflow_id: "workflow-purchase-003",
    product_code: "TEST_BASIC",
    expires_at: "2025-01-01T00:00:00Z", // Already expired
    created_at: TestDates.PAST_2024.toISOString(),
    created_month: "2024-12-01"
  },

  // Future lot for testing date filtering
  FUTURE_LOT: {
    entry_id: "550e8400-e29b-41d4-a716-446655440006",
    user_id: TestUsers.USER_3,
    lot_id: "550e8400-e29b-41d4-a716-446655440006", // Self-reference
    lot_month: "2026-01-01",
    amount: 300,
    reason: "purchase",
    operation_type: "payment_card",
    resource_amount: 299.99,
    resource_unit: "USD",
    workflow_id: "workflow-purchase-004",
    product_code: "TEST_PREMIUM",
    expires_at: "2026-04-15T00:00:00Z",
    created_at: TestDates.FUTURE_2026.toISOString(),
    created_month: "2026-01-01"
  }
}

// All test entries as array for easy iteration
export const TestLedgerEntriesArray = Object.values(TestLedgerEntries)

// Expected lot summaries for balance calculations
export const TestLotSummaries = {
  PURCHASE_LOT_1_SUMMARY: {
    lot_id: "550e8400-e29b-41d4-a716-446655440001",
    lot_month: "2025-01-01",
    user_id: TestUsers.USER_1,
    initial_amount: 100,
    current_balance: 75, // 100 - 25 consumed
    product_code: "TEST_BASIC",
    expires_at: new Date("2025-02-15T00:00:00Z"),
    issued_at: TestDates.JAN_EARLY_2025,
    is_expired: false
  },

  WELCOME_LOT_1_SUMMARY: {
    lot_id: "550e8400-e29b-41d4-a716-446655440002",
    lot_month: "2025-01-01",
    user_id: TestUsers.USER_1,
    initial_amount: 50,
    current_balance: 50, // No consumption yet
    product_code: "TEST_WELCOME",
    expires_at: new Date("2025-02-15T00:00:00Z"),
    issued_at: TestDates.JAN_LATE_2025,
    is_expired: false
  },

  PURCHASE_LOT_2_SUMMARY: {
    lot_id: "550e8400-e29b-41d4-a716-446655440004",
    lot_month: "2025-02-01",
    user_id: TestUsers.USER_2,
    initial_amount: 200,
    current_balance: 200, // No consumption yet
    product_code: "TEST_PREMIUM",
    expires_at: new Date("2025-05-15T00:00:00Z"),
    issued_at: TestDates.FEB_2025,
    is_expired: false
  },

  EXPIRED_LOT_SUMMARY: {
    lot_id: "550e8400-e29b-41d4-a716-446655440005",
    lot_month: "2024-12-01",
    user_id: TestUsers.USER_3,
    initial_amount: 75,
    current_balance: 75, // No consumption (expired before use)
    product_code: "TEST_BASIC",
    expires_at: new Date("2025-01-01T00:00:00Z"),
    issued_at: TestDates.PAST_2024,
    is_expired: true
  }
}

// All lot summaries as array
export const TestLotSummariesArray = Object.values(TestLotSummaries)

// Helper functions for creating test data variations
export const createTestLedgerEntry = (overrides = {}) => {
  const createdAt = TestDates.JAN_EARLY_2025
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

export const createTestDebitEntry = (lotId, lotMonth, overrides = {}) => {
  const createdAt = TestDates.FEB_2025
  const entryId = "test-debit-" + Math.random().toString(36).substring(7)

  return {
    entry_id: entryId,
    user_id: TestUsers.USER_1,
    lot_id: lotId,
    lot_month: lotMonth,
    amount: -25,
    reason: "debit",
    operation_type: "text_generation",
    resource_amount: 1000,
    resource_unit: "tokens",
    workflow_id: "test-operation",
    product_code: null,
    expires_at: null,
    created_at: createdAt,
    created_month: createMonthDate(createdAt),
    ...overrides
  }
}

export const createTestLotSummary = (overrides = {}) => {
  return {
    lot_id: "test-lot-" + Math.random().toString(36).substring(7),
    lot_month: "2025-01-01",
    user_id: TestUsers.USER_1,
    initial_amount: 100,
    current_balance: 100,
    product_code: "TEST_BASIC",
    expires_at: new Date("2025-02-15T00:00:00Z"),
    issued_at: TestDates.JAN_EARLY_2025,
    is_expired: false,
    ...overrides
  }
}
