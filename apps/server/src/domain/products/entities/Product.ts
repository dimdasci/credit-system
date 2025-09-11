import { Schema } from "@effect/schema"

// Product distribution type enumeration
export const ProductDistribution = Schema.Literal("sellable", "grant")

// Grant policy enumeration
export const GrantPolicy = Schema.Literal("apply_on_signup", "manual_grant")

// Price row for country-specific pricing
export class PriceRow extends Schema.Class<PriceRow>("PriceRow")({
  product_code: Schema.String,
  country: Schema.String, // ISO-3166-1 alpha-2 or "*" for fallback
  currency: Schema.String,
  amount: Schema.Number.pipe(Schema.positive()), // decimal(19,4)
  vat_info: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })) // JSONB
}) {}

export namespace PriceRow {
  export type Encoded = Schema.Schema.Encoded<typeof PriceRow>
  export type Context = Schema.Schema.Context<typeof PriceRow>
}

// Product entity for merchant catalog management
export class Product extends Schema.Class<Product>("Product")({
  product_code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50)),
  title: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  credits: Schema.Number.pipe(Schema.positive(), Schema.int()),
  access_period_days: Schema.Number.pipe(Schema.positive(), Schema.int()),
  distribution: ProductDistribution,
  grant_policy: Schema.optional(GrantPolicy),
  // Lifecycle Management
  effective_at: Schema.Date,
  archived_at: Schema.optional(Schema.Date),
  // Related pricing (not stored in this table but related)
  price_rows: Schema.optional(Schema.Array(PriceRow))
}) {
  // Business logic methods
  isActive(): boolean {
    const now = new Date()
    return this.effective_at <= now && this.archived_at === undefined
  }

  isArchived(): boolean {
    return this.archived_at !== undefined
  }

  isSellable(): boolean {
    return this.distribution === "sellable"
  }

  isGrant(): boolean {
    return this.distribution === "grant"
  }

  requiresGrantPolicy(): boolean {
    return this.distribution === "grant" && this.grant_policy !== undefined
  }

  // Price resolution logic
  findPriceForCountry(country: string): PriceRow | undefined {
    if (!this.price_rows) return undefined

    // Try country-specific first
    const countrySpecific = this.price_rows.find((pr) => pr.country === country)
    if (countrySpecific) return countrySpecific

    // Fall back to "*" if available
    return this.price_rows.find((pr) => pr.country === "*")
  }

  isAvailableInCountry(country: string): boolean {
    return this.findPriceForCountry(country) !== undefined
  }
}

export namespace Product {
  export type Encoded = Schema.Schema.Encoded<typeof Product>
  export type Context = Schema.Schema.Context<typeof Product>
}
