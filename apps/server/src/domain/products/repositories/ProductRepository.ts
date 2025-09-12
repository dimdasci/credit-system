import { Effect, Context } from "effect"
import { Product } from "../entities/Product.js"
import { DomainError } from "../../shared/errors/DomainErrors.js"

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
  getActiveProducts: (distribution?: "sellable" | "grant", options?: ProductQueryOptions) => Effect.Effect<Product[], DomainError>
  archiveProduct: (code: string, archived_at: Date) => Effect.Effect<void, DomainError>
  
  // Pricing operations
  getResolvedPrice: (product_code: string, country: string) => Effect.Effect<{
    country: string
    currency: string
    amount: number
    vat_info?: Record<string, unknown>
  } | null, DomainError>
  
  // Lifecycle queries
  getProductsByEffectiveDate: (at_date: Date, distribution?: "sellable" | "grant") => Effect.Effect<Product[], DomainError>
  isProductActive: (product_code: string, at_date?: Date) => Effect.Effect<boolean, DomainError>
}

// Context tag for dependency injection
export const ProductRepository = Context.GenericTag<ProductRepository>("ProductRepository")