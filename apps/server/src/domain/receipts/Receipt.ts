import { MonthDate } from "@server/domain/shared/MonthDate.js"
import { UserId } from "@server/domain/shared/UserId.js"
import { Schema } from "effect"

// Receipt entity for purchase documentation
export class Receipt extends Schema.Class<Receipt>("Receipt")({
  receipt_id: Schema.UUID,
  user_id: UserId,
  lot_id: Schema.UUID,
  lot_created_month: MonthDate, // References ledger_entries composite key
  receipt_number: Schema.String.pipe(Schema.minLength(1)), // Merchant-scoped sequence
  issued_at: Schema.Date,
  // JSONB fields - use flexible Record for purchase and merchant config snapshots
  purchase_snapshot: Schema.Record({
    key: Schema.String,
    value: Schema.Unknown
  }),
  merchant_config_snapshot: Schema.Record({
    key: Schema.String,
    value: Schema.Unknown
  })
}) {
  // Business logic methods
  isValidReceipt(): boolean {
    return this.receipt_number.length > 0 &&
      this.issued_at <= new Date() &&
      this.hasValidPurchaseSnapshot()
  }

  hasValidPurchaseSnapshot(): boolean {
    const snapshot = this.purchase_snapshot as any
    return snapshot &&
      typeof snapshot.product_code === "string" &&
      typeof snapshot.amount === "number" &&
      typeof snapshot.currency === "string"
  }

  getPurchaseAmount(): number | undefined {
    const snapshot = this.purchase_snapshot as any
    return snapshot?.amount
  }

  getPurchaseCurrency(): string | undefined {
    const snapshot = this.purchase_snapshot as any
    return snapshot?.currency
  }

  getProductCode(): string | undefined {
    const snapshot = this.purchase_snapshot as any
    return snapshot?.product_code
  }

  getMerchantLegalName(): string | undefined {
    const config = this.merchant_config_snapshot as any
    return config?.legal_name
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
      productCode?: string
      amount?: number
      currency?: string
      externalRef?: string
    }
    merchant: {
      legalName?: string
      address?: string
      taxRegime?: string
    }
  } {
    const purchase = this.purchase_snapshot as any
    const merchant = this.merchant_config_snapshot as any

    return {
      receiptNumber: this.receipt_number,
      issuedAt: this.issued_at,
      purchase: {
        productCode: purchase?.product_code,
        amount: purchase?.amount,
        currency: purchase?.currency,
        externalRef: purchase?.external_ref
      },
      merchant: {
        legalName: merchant?.legal_name,
        address: merchant?.registered_address,
        taxRegime: merchant?.tax_regime
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
    const purchase = receipt.purchase_snapshot as any
    return purchase &&
      typeof purchase.product_code === "string" &&
      typeof purchase.amount === "number" &&
      typeof purchase.currency === "string" &&
      purchase.amount > 0
  })
)
