import type { Effect } from "effect"
import { Context } from "effect"
import type { DomainError } from "../../shared/errors/DomainErrors.js"
import type { Product } from "../entities/Product.js"

// Query options for product catalog operations
export interface ProductQueryOptions {
  limit?: number
  offset?: number
  includeArchived?: boolean
}

// Repository interface for product catalog management
export interface ProductRepository {
  // Core CRUD operations
  createProduct: (product: Product) => Effect.Effect<void, DomainError>
  getProductByCode: (code: string) => Effect.Effect<Product | null, DomainError>
  getActiveProducts: (
    distribution?: "sellable" | "grant",
    options?: ProductQueryOptions
  ) => Effect.Effect<Array<Product>, DomainError>
  archiveProduct: (code: string, archived_at: Date) => Effect.Effect<void, DomainError>

  // Pricing operations
  getResolvedPrice: (product_code: string, country: string) => Effect.Effect<
    {
      country: string
      currency: string
      amount: number
      vat_info?: Record<string, unknown>
    } | null,
    DomainError
  >

  // Lifecycle queries
  getProductsByEffectiveDate: (
    at_date: Date,
    distribution?: "sellable" | "grant"
  ) => Effect.Effect<Array<Product>, DomainError>
  isProductActive: (product_code: string, at_date?: Date) => Effect.Effect<boolean, DomainError>
}

// Context tag for dependency injection
export const ProductRepository = Context.GenericTag<ProductRepository>("ProductRepository")
