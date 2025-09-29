import { PurchaseRpcs } from "@credit-system/rpc"
import type * as SqlError from "@effect/sql/SqlError"
import { Authorization } from "@server/application/rpc/middleware/AuthorizationMiddleware.js"
import { InvalidRequest, ProductUnavailable, ServiceUnavailable } from "@server/domain/shared/DomainErrors.js"
import { PurchaseSettlementService } from "@server/services/business/PurchaseSettlementService.js"
import { Effect } from "effect"
import type { ConfigError } from "effect/ConfigError"
import type { ParseError } from "effect/ParseResult"

// Apply authorization middleware to all purchase RPCs
export const ProtectedPurchaseRpcs = PurchaseRpcs.middleware(Authorization)

// Create purchase handlers layer
export const PurchaseHandlers = ProtectedPurchaseRpcs.toLayer({
  purchaseSettled: (request) =>
    Effect.gen(function*() {
      // 2. Convert RPC input to service request format
      const taxBreakdown = request.settlementData.pricingSnapshot.taxBreakdown

      const pricingSnapshot = {
        country: request.settlementData.pricingSnapshot.country,
        currency: request.settlementData.pricingSnapshot.currency,
        amount: request.settlementData.pricingSnapshot.amount,
        ...(taxBreakdown && {
          tax_breakdown: {
            type: taxBreakdown.type,
            ...(taxBreakdown.rate !== undefined && { rate: taxBreakdown.rate }),
            ...(taxBreakdown.amount !== undefined && { amount: taxBreakdown.amount }),
            ...(taxBreakdown.note !== undefined && { note: taxBreakdown.note })
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
      Effect.mapError(
        (
          error:
            | ProductUnavailable
            | ServiceUnavailable
            | InvalidRequest
            | ConfigError
            | SqlError.SqlError
            | ParseError
        ) => {
          if (error instanceof ProductUnavailable) {
            // Map domain error reasons to RPC error reasons
            const rpcReason = (() => {
              switch (error.reason) {
                case "not_found":
                  return "not_found" as const
                case "archived":
                  return "archived" as const
                case "not_available_in_country":
                  return "country_unavailable" as const
                case "pricing_changed":
                  return "pricing_mismatch" as const
                default:
                  // This should never happen due to schema validation, but handle gracefully
                  return "not_found" as const
              }
            })()

            return {
              _tag: "ProductUnavailable" as const,
              productCode: error.product_code,
              reason: rpcReason
            }
          }

          if (error instanceof ServiceUnavailable) {
            return {
              _tag: "ServiceUnavailable" as const,
              retryAfter: "30s"
            }
          }

          if (error instanceof InvalidRequest) {
            return {
              _tag: "InvalidRequest" as const,
              field: error.field ?? "unknown",
              message: error.reason ?? "Invalid request"
            }
          }

          return {
            _tag: "ServiceUnavailable" as const,
            retryAfter: "30s"
          }
        }
      )
    )
})
