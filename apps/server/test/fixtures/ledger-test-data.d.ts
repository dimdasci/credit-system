/// <reference types="node" />

/**
 * @typedef {Object} TestDates
 * @property {Date} JAN_EARLY_2025
 * @property {Date} JAN_LATE_2025
 * @property {Date} FEB_2025
 * @property {Date} MAR_2025
 * @property {Date} PAST_2024
 * @property {Date} FUTURE_2026
 */

/**
 * @typedef {Object} LedgerEntry
 * @property {string} entry_id
 * @property {string} user_id
 * @property {string} lot_id
 * @property {string} lot_month
 * @property {number} amount
 * @property {"purchase" | "welcome" | "promo" | "adjustment" | "debit" | "expiry" | "refund" | "chargeback"} reason
 * @property {string} operation_type
 * @property {number | null} resource_amount
 * @property {string | null} resource_unit
 * @property {string | null} workflow_id
 * @property {string | null} product_code
 * @property {string | null} expires_at
 * @property {string} created_at
 * @property {string} created_month
 */

/**
 * @typedef {Object} LotSummary
 * @property {string} lot_id
 * @property {string} lot_month
 * @property {string} user_id
 * @property {number} initial_amount
 * @property {number} current_balance
 * @property {string | null} product_code
 * @property {Date | null} expires_at
 * @property {Date} issued_at
 * @property {boolean} is_expired
 */

/**
 * Test dates for consistent temporal scenarios
 * @type {TestDates}
 */
export const TestDates: {
  JAN_EARLY_2025: Date
  JAN_LATE_2025: Date
  FEB_2025: Date
  MAR_2025: Date
  PAST_2024: Date
  FUTURE_2026: Date
}

/**
 * Test user IDs
 * @type {{USER_1: string, USER_2: string, USER_3: string}}
 */
export const TestUsers: {
  USER_1: string
  USER_2: string
  USER_3: string
}

/**
 * Test ledger entries dictionary
 * @type {Record<string, LedgerEntry>}
 */
export const TestLedgerEntries: Record<string, any>

/**
 * All test ledger entries as an array
 * @type {Array<LedgerEntry>}
 */
export const TestLedgerEntriesArray: Array<any>

/**
 * Test lot summaries dictionary
 * @type {Record<string, LotSummary>}
 */
export const TestLotSummaries: Record<string, any>

/**
 * All test lot summaries as an array
 * @type {Array<LotSummary>}
 */
export const TestLotSummariesArray: Array<any>

/**
 * Creates a test ledger entry
 * @param {Record<string, any>} [overrides] - Overrides for the default values
 * @returns {LedgerEntry} The test ledger entry
 */
export function createTestLedgerEntry(overrides?: Record<string, any>): any

/**
 * Creates a test debit entry
 * @param {string} lotId - The lot ID to reference
 * @param {string} lotMonth - The lot month to reference
 * @param {Record<string, any>} [overrides] - Overrides for the default values
 * @returns {LedgerEntry} The test debit entry
 */
export function createTestDebitEntry(lotId: string, lotMonth: string, overrides?: Record<string, any>): any

/**
 * Creates a test lot summary
 * @param {Record<string, any>} [overrides] - Overrides for the default values
 * @returns {LotSummary} The test lot summary
 */
export function createTestLotSummary(overrides?: Record<string, any>): any
