import { Schema } from "effect"

// Tax regime options for merchant configuration
export const TaxRegime = Schema.Literal("vat", "turnover", "none")

// MerchantConfig domain model - loaded from environment variables
export class MerchantConfig extends Schema.Class<MerchantConfig>("MerchantConfig")({
  merchantId: Schema.String,
  legalName: Schema.String.pipe(Schema.minLength(1)),
  registeredAddress: Schema.String.pipe(Schema.minLength(1)),
  country: Schema.String.pipe(Schema.minLength(2), Schema.maxLength(2)), // ISO 3166-1 alpha-2
  taxRegime: TaxRegime,
  vatRate: Schema.optional(Schema.Number.pipe(Schema.between(0, 1))),
  taxStatusNote: Schema.optional(Schema.String),
  receiptSeriesPrefix: Schema.String.pipe(Schema.minLength(1)),
  operationTimeoutMinutes: Schema.Number.pipe(Schema.positive()),
  retentionYears: Schema.Number.pipe(Schema.positive())
}) {
  // Business validation methods
  isVatApplicable(): boolean {
    return this.taxRegime === "vat"
  }

  getEffectiveVatRate(): number {
    return this.isVatApplicable() && this.vatRate !== undefined ? this.vatRate : 0
  }

  validateTaxConfiguration(): boolean {
    // VAT regime must have VAT rate
    if (this.taxRegime === "vat" && this.vatRate === undefined) {
      return false
    }

    // VAT rate should be between 0 and 1
    if (this.vatRate !== undefined && (this.vatRate < 0 || this.vatRate > 1)) {
      return false
    }

    return true
  }

  // Generate snapshot for receipts
  toReceiptSnapshot() {
    return {
      merchant_id: this.merchantId,
      legal_name: this.legalName,
      registered_address: this.registeredAddress,
      country: this.country,
      tax_regime: this.taxRegime,
      vat_rate: this.vatRate,
      tax_status_note: this.taxStatusNote,
      receipt_series_prefix: this.receiptSeriesPrefix,
      operation_timeout_minutes: this.operationTimeoutMinutes,
      retention_years: this.retentionYears
    }
  }
}

export namespace MerchantConfig {
  export type Encoded = Schema.Schema.Encoded<typeof MerchantConfig>
  export type Context = Schema.Schema.Context<typeof MerchantConfig>
}
