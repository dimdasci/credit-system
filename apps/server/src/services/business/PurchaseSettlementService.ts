import { MerchantContext } from "@credit-system/shared"
import { Lot } from "@server/domain/credit-ledger/Lot.js"
import type { Product } from "@server/domain/products/Product.js"
import { Receipt } from "@server/domain/receipts/Receipt.js"
import type { DuplicateAdminAction, ProductUnavailable } from "@server/domain/shared/DomainErrors.js"
import { InvalidRequest, ServiceUnavailable } from "@server/domain/shared/DomainErrors.js"
import type { PricingSnapshot } from "@server/services/business/PricingService.js"
import { PricingService } from "@server/services/business/PricingService.js"
import { ProductService } from "@server/services/business/ProductService.js"
import { DatabaseManager } from "@server/services/external/DatabaseManager.js"
import { MerchantConfigService } from "@server/services/external/MerchantConfigService.js"
import { LedgerRepository } from "@server/services/repositories/LedgerRepository.js"
import { ReceiptRepository } from "@server/services/repositories/ReceiptRepository.js"
import { Effect, Option, Schema } from "effect"
import { randomUUID } from "node:crypto"

// Request/Response Interfaces
export interface SettlementRequest {
  user_id: string
  product_code: string
  pricing_snapshot: PricingSnapshot
  order_placed_at: Date
  external_ref: string
  settled_at: Date
}

export interface SettlementResult {
  lot: Lot // the created credit lot
  receipt: Receipt
}

// Service interface
export interface PurchaseSettlementServiceContract {
  settlePurchase: (
    request: SettlementRequest
  ) => Effect.Effect<
    SettlementResult,
    ProductUnavailable | ServiceUnavailable | DuplicateAdminAction | InvalidRequest
  >
}

const dataCorruptionError = () =>
  new ServiceUnavailable({
    service: "PurchaseSettlementService",
    reason: "data_corruption",
    retry_after_seconds: 0
  })

const resolveExistingSettlement = (request: SettlementRequest) =>
  Effect.gen(function*() {
    const ledgerRepo = yield* LedgerRepository
    const receiptRepo = yield* ReceiptRepository
    const existingReceipt = yield* receiptRepo.getReceiptByExternalRef(request.external_ref)

    if (!existingReceipt) {
      return null
    }

    const existingLotEntry = yield* ledgerRepo.getLotById(
      existingReceipt.lot_id,
      existingReceipt.lot_created_month
    )

    if (!existingLotEntry) {
      return yield* Effect.fail(dataCorruptionError())
    }

    const productCode = Option.getOrNull(existingLotEntry.product_code)
    const expiresAt = Option.getOrNull(existingLotEntry.expires_at)

    if (!productCode || !expiresAt || existingLotEntry.amount <= 0) {
      return yield* Effect.fail(dataCorruptionError())
    }

    const lot = yield* Schema.decode(Lot)({
      entry_id: existingLotEntry.entry_id,
      user_id: existingLotEntry.user_id,
      lot_month: existingLotEntry.lot_month,
      initial_amount: existingLotEntry.amount,
      product_code: productCode,
      expires_at: expiresAt.toISOString(),
      created_at: existingLotEntry.created_at.toISOString(),
      created_month: existingLotEntry.created_month
    }).pipe(Effect.mapError(() => dataCorruptionError()))

    if (existingReceipt.user_id !== request.user_id) {
      return yield* Effect.fail(
        new InvalidRequest({
          field: "external_ref",
          reason: "workflow_id_mismatch",
          details: "Existing settlement is associated with a different user"
        })
      )
    }

    if (lot.product_code !== request.product_code) {
      return yield* Effect.fail(
        new InvalidRequest({
          field: "external_ref",
          reason: "workflow_id_mismatch",
          details: "Existing settlement references a different product"
        })
      )
    }

    const purchaseSnapshot = existingReceipt.purchase_snapshot as {
      product_code?: string
      country?: string
      currency?: string
      amount?: number
      tax_breakdown?: unknown
    }

    if (purchaseSnapshot.product_code !== request.product_code) {
      return yield* Effect.fail(
        new InvalidRequest({
          field: "external_ref",
          reason: "workflow_id_mismatch",
          details: "Existing settlement recorded a different product code"
        })
      )
    }

    if (
      purchaseSnapshot.amount !== request.pricing_snapshot.amount ||
      purchaseSnapshot.currency !== request.pricing_snapshot.currency ||
      purchaseSnapshot.country !== request.pricing_snapshot.country
    ) {
      return yield* Effect.fail(
        new InvalidRequest({
          field: "external_ref",
          reason: "workflow_id_mismatch",
          details: "Existing settlement recorded different pricing details"
        })
      )
    }

    const purchaseTax = JSON.stringify(purchaseSnapshot.tax_breakdown ?? null)
    const requestTax = JSON.stringify(request.pricing_snapshot.tax_breakdown ?? null)

    if (purchaseTax !== requestTax) {
      return yield* Effect.fail(
        new InvalidRequest({
          field: "external_ref",
          reason: "workflow_id_mismatch",
          details: "Existing settlement recorded different tax breakdown"
        })
      )
    }

    return { lot, receipt: existingReceipt }
  })

const buildReceipt = (
  request: SettlementRequest,
  product: Product,
  lot: Lot,
  receiptNumber: string,
  receiptId: string
) =>
  Effect.gen(function*() {
    const merchantConfigService = yield* MerchantConfigService
    const merchantConfig = yield* merchantConfigService.getCurrentMerchantConfig()

    return yield* Schema.decode(Receipt)({
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
      merchant_config_snapshot: merchantConfig.toReceiptSnapshot()
    }).pipe(Effect.mapError(() => dataCorruptionError()))
  })

export class PurchaseSettlementService extends Effect.Service<PurchaseSettlementService>()(
  "PurchaseSettlementService",
  {
    effect: Effect.gen(function*() {
      const merchantContext = yield* MerchantContext

      const settlePurchase = (request: SettlementRequest) =>
        Effect.gen(function*() {
          const db = yield* DatabaseManager
          const sqlClient = yield* db.getConnection(merchantContext.merchantId)
            .pipe(Effect.mapError(() =>
              new ServiceUnavailable({
                service: "PurchaseSettlementService",
                reason: "database_connection_failure",
                retry_after_seconds: 5
              })
            ))

          return yield* sqlClient.withTransaction(
            Effect.gen(function*() {
              const pricingService = yield* PricingService
              const resolved = yield* pricingService.resolvePrice(
                request.product_code,
                request.pricing_snapshot.country,
                request.order_placed_at
              )
              const product = resolved.product

              yield* pricingService.validatePricingSnapshot(request.pricing_snapshot, resolved)

              const existingSettlement = yield* resolveExistingSettlement(request)
              if (existingSettlement) {
                return existingSettlement
              }

              const ledgerRepo = yield* LedgerRepository
              const receiptRepo = yield* ReceiptRepository

              const lot = yield* ledgerRepo.createCreditLot(
                request.user_id,
                product,
                {
                  operation_type: "payment_settlement",
                  resource_amount: request.pricing_snapshot.amount,
                  resource_unit: request.pricing_snapshot.currency,
                  workflow_id: request.external_ref,
                  reason: "purchase",
                  settled_at: request.settled_at,
                  created_at: request.settled_at
                }
              )

              const merchantConfigService = yield* MerchantConfigService
              const merchantConfig = yield* merchantConfigService.getCurrentMerchantConfig()

              const receiptId = randomUUID()
              const receiptNumber = yield* receiptRepo.getNextReceiptNumber(
                merchantConfig.receiptSeriesPrefix,
                request.settled_at.getFullYear()
              )
              const receipt = yield* buildReceipt(
                request,
                product,
                lot,
                receiptNumber,
                receiptId
              )

              yield* receiptRepo.createReceipt(receipt)

              return { lot, receipt }
            })
          )
        })

      return {
        settlePurchase
      } as const
    }),
    dependencies: [
      LedgerRepository.Default,
      ReceiptRepository.Default,
      MerchantConfigService.Default,
      PricingService.Default,
      ProductService.Default
    ]
  }
) {}
