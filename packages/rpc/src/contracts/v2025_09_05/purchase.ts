import { Rpc, RpcGroup } from "@effect/rpc"
import { Schema } from "effect"

// Input schema for purchase settlement
export const PurchaseSettledInput = Schema.Struct({
  userId: Schema.String,
  productCode: Schema.String,
  settlementData: Schema.Struct({
    externalRef: Schema.String, // Payment provider reference for idempotency
    orderPlacedAt: Schema.Date,
    settledAt: Schema.Date,
    pricingSnapshot: Schema.Struct({
      country: Schema.String, // ISO-3166-1 alpha-2
      currency: Schema.String, // ISO-4217
      amount: Schema.Number,
      taxBreakdown: Schema.optional(Schema.Struct({
        type: Schema.Literal("vat", "turnover", "none"),
        rate: Schema.optional(Schema.Number),
        amount: Schema.optional(Schema.Number),
        note: Schema.optional(Schema.String)
      }))
    })
  })
})

// Success response schema
export const PurchaseSettledSuccess = Schema.Struct({
  lot: Schema.Struct({
    lotId: Schema.String,
    creditsTotal: Schema.Int,
    creditsRemaining: Schema.Int,
    expiresAt: Schema.Date,
    issuedAt: Schema.Date
  }),
  receipt: Schema.Struct({
    receiptId: Schema.String,
    receiptNumber: Schema.String, // "R-ACME-2025-0001"
    issuedAt: Schema.Date
    // Note: No downloadUrl - PDF generation is responsibility of upstream applications
    // per architectural boundary defined in @knowledge/domain/05_receipts_and_tax.md
  }),
  userBalance: Schema.Struct({
    balance: Schema.Int,
    currency: Schema.Literal("credits"),
    lastUpdated: Schema.Date
  })
})

// Error response schemas
export const PurchaseSettledError = Schema.Union(
  Schema.Struct({
    _tag: Schema.Literal("ProductUnavailable"),
    productCode: Schema.String,
    reason: Schema.Literal("not_found", "archived", "country_unavailable", "pricing_mismatch")
  }),
  Schema.Struct({
    _tag: Schema.Literal("DuplicateSettlement"),
    externalRef: Schema.String,
    existingLotId: Schema.String,
    existingReceiptId: Schema.String
  }),
  Schema.Struct({
    _tag: Schema.Literal("InvalidRequest"),
    field: Schema.String,
    message: Schema.String
  }),
  Schema.Struct({
    _tag: Schema.Literal("ServiceUnavailable"),
    retryAfter: Schema.String // "5s", "30s", etc.
  })
)

// Purchase settlement RPC definition
export const purchaseSettledRpc = Rpc.make("purchaseSettled", {
  payload: PurchaseSettledInput,
  success: PurchaseSettledSuccess,
  error: PurchaseSettledError
})

// RPC group for purchase operations
export const PurchaseRpcs = RpcGroup.make(purchaseSettledRpc)
