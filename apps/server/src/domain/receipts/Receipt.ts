import { MonthDate } from "@server/domain/shared/MonthDate.js"
import { UserId } from "@server/domain/shared/UserId.js"
import { Schema } from "effect"

// Purchase snapshot schema based on domain specifications
export const PurchaseSnapshot = Schema.Struct({
  product_code: Schema.String,
  product_title: Schema.String,
  external_ref: Schema.String,
  country: Schema.String, // ISO-3166-1 alpha-2
  currency: Schema.String,
  amount: Schema.Number,
  tax_breakdown: Schema.optional(Schema.Struct({
    type: Schema.Literal("vat", "turnover", "none"),
    rate: Schema.optional(Schema.Number),
    amount: Schema.optional(Schema.Number),
    note: Schema.optional(Schema.String)
  }))
})

// Merchant config snapshot schema based on domain specifications
export const MerchantConfigSnapshot = Schema.Struct({
  merchant_id: Schema.String,
  legal_name: Schema.String,
  registered_address: Schema.String,
  country: Schema.String,
  tax_regime: Schema.Literal("turnover", "vat", "none"),
  vat_rate: Schema.optional(Schema.Number),
  tax_status_note: Schema.optional(Schema.String),
  receipt_series_prefix: Schema.String,
  operation_timeout_minutes: Schema.Number,
  retention_years: Schema.Number
})

// Receipt entity for purchase documentation
export class Receipt extends Schema.Class<Receipt>("Receipt")({
  receipt_id: Schema.UUID,
  user_id: UserId,
  lot_id: Schema.UUID,
  lot_created_month: MonthDate, // References ledger_entries composite key
  receipt_number: Schema.String.pipe(Schema.minLength(1)), // Merchant-scoped sequence
  issued_at: Schema.Date,
  // JSONB fields with proper domain typing
  purchase_snapshot: PurchaseSnapshot,
  merchant_config_snapshot: MerchantConfigSnapshot
}) {
  // Business logic methods
  isValidReceipt(): boolean {
    return this.receipt_number.length > 0 &&
      this.issued_at <= new Date() &&
      this.hasValidPurchaseSnapshot()
  }

  hasValidPurchaseSnapshot(): boolean {
    return this.purchase_snapshot.product_code.length > 0 &&
      this.purchase_snapshot.amount > 0 &&
      this.purchase_snapshot.currency.length > 0
  }

  getPurchaseAmount(): number {
    return this.purchase_snapshot.amount
  }

  getPurchaseCurrency(): string {
    return this.purchase_snapshot.currency
  }

  getProductCode(): string {
    return this.purchase_snapshot.product_code
  }

  getMerchantLegalName(): string {
    return this.merchant_config_snapshot.legal_name
  }

  getReceiptSequenceNumber(): string {
    // Extract sequence from receipt number (format: "R-AM-2025-0001")
    const parts = this.receipt_number.split("-")
    return parts[parts.length - 1] || "0000"
  }

  // Generate PDF-ready data structure
  toPdfData(): {
    receiptNumber: string
    issuedAt: Date
    purchase: {
      productCode: string
      amount: number
      currency: string
      externalRef: string
    }
    merchant: {
      legalName: string
      address: string
      taxRegime: string
    }
  } {
    return {
      receiptNumber: this.receipt_number,
      issuedAt: this.issued_at,
      purchase: {
        productCode: this.purchase_snapshot.product_code,
        amount: this.purchase_snapshot.amount,
        currency: this.purchase_snapshot.currency,
        externalRef: this.purchase_snapshot.external_ref
      },
      merchant: {
        legalName: this.merchant_config_snapshot.legal_name,
        address: this.merchant_config_snapshot.registered_address,
        taxRegime: this.merchant_config_snapshot.tax_regime
      }
    }
  }
}

export namespace Receipt {
  export type Encoded = Schema.Schema.Encoded<typeof Receipt>
  export type Context = Schema.Schema.Context<typeof Receipt>
}

// Business rule validation schema for complete receipts
export const ValidatedReceipt = Receipt.pipe(
  Schema.filter((receipt): receipt is Receipt => {
    // Ensure required purchase snapshot fields
    return receipt.purchase_snapshot.product_code.length > 0 &&
      receipt.purchase_snapshot.amount > 0 &&
      receipt.purchase_snapshot.currency.length > 0
  })
)
