import { PurchaseRpcs } from "@credit-system/rpc"
import { Authorization } from "@server/application/rpc/middleware/AuthorizationMiddleware.js"
import { PurchaseSettlementService } from "@server/services/business/PurchaseSettlementService.js"
import { Effect } from "effect"

// Apply authorization middleware to all purchase RPCs
export const ProtectedPurchaseRpcs = PurchaseRpcs.middleware(Authorization)

// Create purchase handlers layer
export const PurchaseHandlers = ProtectedPurchaseRpcs.toLayer({
  purchaseSettled: (request) =>
    Effect.gen(function*() {
      // 2. Convert RPC input to service request format
      const pricingSnapshot = {
        country: request.settlementData.pricingSnapshot.country,
        currency: request.settlementData.pricingSnapshot.currency,
        amount: request.settlementData.pricingSnapshot.amount,
        ...(request.settlementData.pricingSnapshot.taxBreakdown && {
          tax_breakdown: {
            ...(request.settlementData.pricingSnapshot.taxBreakdown.rate !== undefined && {
              rate: request.settlementData.pricingSnapshot.taxBreakdown.rate
            }),
            ...(request.settlementData.pricingSnapshot.taxBreakdown.amount !== undefined && {
              amount: request.settlementData.pricingSnapshot.taxBreakdown.amount
            }),
            ...(request.settlementData.pricingSnapshot.taxBreakdown.note !== undefined && {
              note: request.settlementData.pricingSnapshot.taxBreakdown.note
            })
          }
        })
      }

      const settlementRequest = {
        user_id: request.userId,
        product_code: request.productCode,
        pricing_snapshot: pricingSnapshot,
        order_placed_at: request.settlementData.orderPlacedAt,
        external_ref: request.settlementData.externalRef,
        settled_at: request.settlementData.settledAt
      }

      // 3. Execute settlement using the service from Task 38
      const purchaseService = yield* PurchaseSettlementService
      const settlement = yield* purchaseService.settlePurchase(settlementRequest)

      // 4. Convert service result to RPC response format
      return {
        lot: {
          lotId: settlement.lot.entry_id,
          creditsTotal: settlement.lot.initial_amount,
          creditsRemaining: settlement.lot.initial_amount, // Newly created lot
          expiresAt: new Date(settlement.lot.expires_at),
          issuedAt: new Date(settlement.lot.created_at)
        },
        receipt: {
          receiptId: settlement.receipt.receipt_id,
          receiptNumber: settlement.receipt.receipt_number,
          issuedAt: new Date(settlement.receipt.issued_at)
          // No downloadUrl - upstream applications handle PDF generation and delivery
        }
      }
    }).pipe(
      // Map domain errors to RPC errors
      Effect.mapError((error) => {
        if (error._tag === "ProductUnavailable") {
          return {
            _tag: "ProductUnavailable" as const,
            productCode: error.product_code,
            reason: error.reason === "not_available_in_country" ?
              "country_unavailable" as const :
              error.reason === "pricing_changed" ?
              "pricing_mismatch" as const :
              error.reason as any
          }
        }

        if (error._tag === "ServiceUnavailable") {
          return {
            _tag: "ServiceUnavailable" as const,
            retryAfter: "30s"
          }
        }

        if (error._tag === "InvalidRequest") {
          return {
            _tag: "InvalidRequest" as const,
            field: error.field || "unknown",
            message: error.reason || "Invalid request"
          }
        }

        // Generic fallback for any unexpected errors
        return {
          _tag: "ServiceUnavailable" as const,
          retryAfter: "30s"
        }
      })
    )
})
