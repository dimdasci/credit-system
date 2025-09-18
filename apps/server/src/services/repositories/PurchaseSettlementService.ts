import { MerchantContext } from "@credit-system/shared"
import { DatabaseManager } from "@server/db/DatabaseManager.js"
import { DatabaseManagerLive, PgLayerFactoryLive } from "@server/db/DatabaseManagerImpl.js"
import type { Lot } from "@server/domain/credit-ledger/Lot.js"
import { Receipt } from "@server/domain/receipts/Receipt.js"
import {
  DuplicateAdminAction,
  InvalidRequest,
  ProductUnavailable,
  ServiceUnavailable
} from "@server/domain/shared/DomainErrors.js"
import { Effect, Layer, Schema } from "effect"
import { randomUUID } from "node:crypto"
import { LedgerRepository } from "./LedgerRepository.js"
import { ProductRepository } from "./ProductRepository.js"
import { ReceiptRepository } from "./ReceiptRepository.js"

// Request/Response Interfaces
export interface SettlementRequest {
  user_id: string
  product_code: string
  pricing_snapshot: PricingSnapshot
  order_placed_at: Date
  external_ref: string
  settled_at: Date
}

export interface PricingSnapshot {
  country: string // ISO-3166-1 alpha-2
  currency: string // ISO-4217
  amount: number // tax-inclusive
  tax_breakdown?: TaxBreakdown
}

export interface TaxBreakdown {
  rate?: number
  amount?: number
  note?: string
}

export interface SettlementResult {
  lot: Lot // the created credit lot
  receipt: Receipt
}

// Error Union Type
export type SettlementError =
  | ProductUnavailable
  | DuplicateAdminAction
  | ServiceUnavailable
  | InvalidRequest

// Service interface - will be implemented in TDD fashion
export interface PurchaseSettlementServiceContract {
  settlePurchase: (request: SettlementRequest) => Effect.Effect<SettlementResult, SettlementError>
}

// Database error mapping utility
const mapDatabaseError = (error: unknown): ServiceUnavailable => {
  if (error && typeof error === "object") {
    const errorObj = error as { code?: string; message?: string; name?: string }

    // PostgreSQL connection errors
    if (errorObj.code === "ECONNREFUSED" || errorObj.code === "ENOTFOUND") {
      return new ServiceUnavailable({
        service: "PurchaseSettlementService",
        reason: "database_connection_failure",
        retry_after_seconds: 5
      })
    }

    // PostgreSQL timeout errors
    if (errorObj.code === "ETIMEOUT" || errorObj.message?.includes("timeout")) {
      return new ServiceUnavailable({
        service: "PurchaseSettlementService",
        reason: "transaction_timeout",
        retry_after_seconds: 30
      })
    }

    // PostgreSQL unique constraint violations (concurrent updates)
    if (errorObj.code === "23505" || errorObj.code === "40001") {
      return new ServiceUnavailable({
        service: "PurchaseSettlementService",
        reason: "concurrent_update_conflict",
        retry_after_seconds: 2
      })
    }
  }

  // Default fallback for unknown database errors
  return new ServiceUnavailable({
    service: "PurchaseSettlementService",
    reason: "database_connection_failure",
    retry_after_seconds: 5
  })
}

export class PurchaseSettlementService extends Effect.Service<PurchaseSettlementService>()(
  "PurchaseSettlementService",
  {
    effect: Effect.gen(function*() {
      const ledgerRepo = yield* LedgerRepository
      const productRepo = yield* ProductRepository
      const receiptRepo = yield* ReceiptRepository
      const merchantContext = yield* MerchantContext
      const db = yield* DatabaseManager

      const settlePurchase = (request: SettlementRequest): Effect.Effect<SettlementResult, SettlementError> =>
        Effect.gen(function*() {
          // Validate input parameters
          if (!request.user_id || request.user_id.trim().length === 0) {
            return yield* Effect.fail(
              new InvalidRequest({
                field: "user_id",
                reason: "invalid_parameters",
                details: "User ID cannot be empty"
              })
            )
          }

          if (!request.product_code || request.product_code.trim().length === 0) {
            return yield* Effect.fail(
              new InvalidRequest({
                field: "product_code",
                reason: "invalid_parameters",
                details: "Product code cannot be empty"
              })
            )
          }

          if (!request.external_ref || request.external_ref.trim().length === 0) {
            return yield* Effect.fail(
              new InvalidRequest({
                field: "external_ref",
                reason: "invalid_parameters",
                details: "External reference cannot be empty"
              })
            )
          }

          // All operations within single transaction
          const sqlClient = yield* db.getConnection(merchantContext.merchantId)
            .pipe(Effect.mapError(mapDatabaseError))

          return yield* sqlClient.withTransaction(
            Effect.gen(function*() {
              // Step 1: Product validation using productRepo.getProductByCode + isProductActive
              const product = yield* productRepo.getProductByCode(request.product_code)
                .pipe(Effect.mapError(mapDatabaseError))

              if (!product) {
                return yield* Effect.fail(
                  new ProductUnavailable({
                    product_code: request.product_code,
                    country: request.pricing_snapshot.country,
                    reason: "not_found"
                  })
                )
              }

              const isActive = yield* productRepo.isProductActive(
                request.product_code,
                request.order_placed_at
              ).pipe(Effect.mapError(mapDatabaseError))

              if (!isActive) {
                return yield* Effect.fail(
                  new ProductUnavailable({
                    product_code: request.product_code,
                    country: request.pricing_snapshot.country,
                    reason: "archived"
                  })
                )
              }

              // Step 2: Pricing validation using productRepo.getResolvedPrice
              const resolvedPrice = yield* productRepo.getResolvedPrice(
                request.product_code,
                request.pricing_snapshot.country
              ).pipe(Effect.mapError(mapDatabaseError))

              if (!resolvedPrice) {
                return yield* Effect.fail(
                  new ProductUnavailable({
                    product_code: request.product_code,
                    country: request.pricing_snapshot.country,
                    reason: "not_available_in_country"
                  })
                )
              }

              // Validate pricing snapshot matches catalog pricing
              if (
                resolvedPrice.amount !== request.pricing_snapshot.amount ||
                resolvedPrice.currency !== request.pricing_snapshot.currency
              ) {
                return yield* Effect.fail(
                  new ProductUnavailable({
                    product_code: request.product_code,
                    country: request.pricing_snapshot.country,
                    reason: "pricing_changed"
                  })
                )
              }

              // Step 3: Idempotency check using receiptRepo.getReceiptByLot
              // First, check if this external_ref already has a settlement
              const existingReceipt = yield* Effect.gen(function*() {
                // We need to check by external_ref, but we don't have a direct method
                // In a real implementation, this would be done via a query that joins
                // receipts with ledger_entries to find by workflow_id (external_ref)
                // For now, we'll simulate this by checking if any receipt exists with matching external_ref
                const ledgerHistory = yield* ledgerRepo.getLedgerHistory(request.user_id)
                const existingEntry = ledgerHistory.find((entry) =>
                  entry.workflow_id?._tag === "Some" && entry.workflow_id.value === request.external_ref &&
                  entry.reason === "purchase"
                )

                if (existingEntry && existingEntry.entry_id === existingEntry.lot_id) {
                  // This is the initial credit entry (lot), check for receipt
                  const receipt = yield* receiptRepo.getReceiptByLot(existingEntry.lot_id)
                  return receipt
                }
                return null
              }).pipe(Effect.mapError(mapDatabaseError))

              if (existingReceipt) {
                return yield* Effect.fail(
                  new DuplicateAdminAction({
                    action_type: "credit_adjustment",
                    external_ref: request.external_ref,
                    original_timestamp: new Date(existingReceipt.issued_at)
                  })
                )
              }

              // Step 4: Create credit lot using ledgerRepo.createCreditLot
              const lot = yield* ledgerRepo.createCreditLot(
                request.user_id,
                product,
                {
                  operation_type: "payment_settlement", // payment method operation type
                  resource_amount: request.pricing_snapshot.amount,
                  resource_unit: request.pricing_snapshot.currency,
                  workflow_id: request.external_ref,
                  reason: "purchase",
                  settled_at: request.settled_at,
                  created_at: request.settled_at
                }
              ).pipe(Effect.mapError(mapDatabaseError))

              // Step 5: Generate receipt using receiptRepo functions
              const receiptId = randomUUID()
              const receiptNumber = yield* receiptRepo.getNextReceiptNumber("R-AM", request.settled_at.getFullYear())
                .pipe(Effect.mapError(mapDatabaseError))

              const receipt = Schema.decodeSync(Receipt)({
                receipt_id: receiptId,
                user_id: request.user_id,
                lot_id: lot.entry_id,
                lot_created_month: lot.lot_month,
                receipt_number: receiptNumber,
                issued_at: request.settled_at.toISOString(),
                purchase_snapshot: {
                  product_code: product.product_code,
                  product_title: product.title,
                  external_ref: request.external_ref,
                  country: request.pricing_snapshot.country,
                  currency: request.pricing_snapshot.currency,
                  amount: request.pricing_snapshot.amount,
                  tax_breakdown: request.pricing_snapshot.tax_breakdown
                },
                merchant_config_snapshot: {
                  merchant_id: merchantContext.merchantId,
                  legal_name: "Credit System LLC", // From merchant config
                  receipt_series_prefix: "R-AM"
                }
              })

              yield* receiptRepo.createReceipt(receipt)
                .pipe(Effect.mapError(mapDatabaseError))

              return { lot, receipt }
            })
          ).pipe(Effect.mapError(mapDatabaseError))
        })

      return {
        settlePurchase
      } as const
    }),
    dependencies: [
      LedgerRepository.Default,
      ProductRepository.Default,
      ReceiptRepository.Default,
      Layer.provide(DatabaseManagerLive, PgLayerFactoryLive)
    ]
  }
) {}
