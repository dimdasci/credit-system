/// <reference types="node" />

/**
 * @typedef {Object} Product
 * @property {string} product_code
 * @property {string} title
 * @property {number} credits
 * @property {number} access_period_days
 * @property {"sellable" | "grant"} distribution
 * @property {string | null} grant_policy
 * @property {string} effective_at
 * @property {string | null} archived_at
 * @property {any | null} price_rows
 */

/**
 * Test product data dictionary
 * @type {Record<string, Product>}
 */
export const TestProducts: Record<string, any>

/**
 * All test products as an array
 * @type {Array<Product>}
 */
export const TestProductsArray: Array<any>

/**
 * Test user IDs
 * @type {{USER_1: string, USER_2: string}}
 */
export const TestUsers: {
  USER_1: string
  USER_2: string
}

/**
 * Creates a test ledger entry
 * @param {Record<string, any>} [overrides] - Overrides for the default values
 * @returns {Object} The test ledger entry
 */
export function createTestLedgerEntry(overrides?: Record<string, any>): any
