import { Schema } from "@effect/schema"
import { Credits } from "@server/domain/shared/values/Credits.js"
import { Option } from "effect"

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
  vat_info: Schema.OptionFromNullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown })) // JSONB
}) {}

export namespace PriceRow {
  export type Encoded = Schema.Schema.Encoded<typeof PriceRow>
  export type Context = Schema.Schema.Context<typeof PriceRow>
}

// Product entity for merchant catalog management
export class Product extends Schema.Class<Product>("Product")({
  product_code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50)),
  title: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  credits: Credits.pipe(Schema.greaterThan(0)),
  access_period_days: Schema.Number.pipe(Schema.positive(), Schema.int()),
  distribution: ProductDistribution,
  grant_policy: Schema.OptionFromNullOr(GrantPolicy),
  // Lifecycle Management
  effective_at: Schema.Date,
  archived_at: Schema.OptionFromNullOr(Schema.Date),
  // Related pricing (not stored in this table but related)
  price_rows: Schema.OptionFromNullOr(Schema.Array(PriceRow))
}) {
  // Business logic methods
  isActive(): boolean {
    const now = new Date()
    return this.effective_at <= now && Option.isNone(this.archived_at)
  }

  isArchived(): boolean {
    return Option.isSome(this.archived_at)
  }

  isSellable(): boolean {
    return this.distribution === "sellable"
  }

  isGrant(): boolean {
    return this.distribution === "grant"
  }

  requiresGrantPolicy(): boolean {
    return this.distribution === "grant" && Option.isSome(this.grant_policy)
  }

  // Price resolution logic
  findPriceForCountry(country: string): PriceRow | undefined {
    if (Option.isNone(this.price_rows)) return undefined
    const priceRows = (this.price_rows as any).value as Array<PriceRow>

    // Try country-specific first
    const countrySpecific = priceRows.find((pr) => pr.country === country)
    if (countrySpecific) return countrySpecific

    // Fall back to "*" if available
    return priceRows.find((pr) => pr.country === "*")
  }

  isAvailableInCountry(country: string): boolean {
    return this.findPriceForCountry(country) !== undefined
  }
}

export namespace Product {
  export type Encoded = Schema.Schema.Encoded<typeof Product>
  export type Context = Schema.Schema.Context<typeof Product>
}

// Schema-level invariant: grant requires grant_policy; sellable forbids it
export const ProductValidated = Product.pipe(
  Schema.filter((p) =>
    ((p as any).distribution === "grant" && Option.isSome((p as any).grant_policy)) ||
    ((p as any).distribution === "sellable" && Option.isNone((p as any).grant_policy))
  )
)
