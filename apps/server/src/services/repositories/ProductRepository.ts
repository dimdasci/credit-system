import { MerchantContext } from "@credit-system/shared"
import * as SqlSchema from "@effect/sql/SqlSchema"
import { Effect, Layer, Schema } from "effect"
import { DatabaseManager } from "../../db/DatabaseManager.js"
import { DatabaseManagerLive, PgLayerFactoryLive } from "../../db/DatabaseManagerImpl.js"
import { Product } from "../../domain/products/Product.js"

export class ProductRepository extends Effect.Service<ProductRepository>()(
  "ProductRepository",
  {
    effect: Effect.gen(function*() {
      const db = yield* DatabaseManager
      const merchantContext = yield* MerchantContext

      const _createProduct = SqlSchema.void({
        Request: Product,
        execute: (product) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            return yield* sql`
              INSERT INTO products (product_code, title, credits, access_period_days, distribution, grant_policy, effective_at, archived_at)
              VALUES (${product.product_code}, ${product.title}, ${product.credits}, ${product.access_period_days}, 
                     ${product.distribution}, ${product.grant_policy}, ${product.effective_at}, ${product.archived_at})
            `
          })
      })

      const _getProductByCode = SqlSchema.single({
        Request: Schema.String,
        Result: Product,
        execute: (code) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            return yield* sql`
              SELECT * FROM products 
              WHERE product_code = ${code}
              LIMIT 1
            `
          })
      })

      const _getActiveProducts = SqlSchema.findAll({
        Request: Schema.Void,
        Result: Product,
        execute: () =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            return yield* sql`
              SELECT * FROM products 
              WHERE effective_at <= NOW() 
              AND archived_at IS NULL
              ORDER BY created_at DESC
            `
          })
      })

      const _getSellableProducts = SqlSchema.findAll({
        Request: Schema.Void,
        Result: Product,
        execute: () =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            return yield* sql`
              SELECT * FROM products 
              WHERE effective_at <= NOW() 
              AND archived_at IS NULL
              AND distribution = 'sellable'
              ORDER BY created_at DESC
            `
          })
      })

      return {
        createProduct: (product: Product) => _createProduct(product),

        getProductByCode: (code: string) =>
          _getProductByCode(code).pipe(
            Effect.catchTag("NoSuchElementException", () => Effect.succeed(null))
          ),

        getActiveProducts: () => _getActiveProducts(),
        getSellableProducts: () => _getSellableProducts(),

        archiveProduct: (code: string, archived_at: Date) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            return yield* sql`
              UPDATE products 
              SET archived_at = ${archived_at}
              WHERE code = ${code}
            `
          }),

        // Pricing operations
        getResolvedPrice: (product_code: string, country: string) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            const result = yield* sql<{
              country: string
              currency: string
              amount: number
              vat_info?: Record<string, unknown>
            }>`
              SELECT 
                COALESCE(cp.country, p.fallback_country) as country,
                COALESCE(cp.currency, p.fallback_currency) as currency,
                COALESCE(cp.amount, p.fallback_amount) as amount,
                COALESCE(cp.vat_info, p.fallback_vat_info) as vat_info
              FROM products p
              LEFT JOIN product_country_pricing cp ON p.code = cp.product_code AND cp.country = ${country}
              WHERE p.code = ${product_code}
              AND p.effective_at <= NOW()
              AND (p.archived_at IS NULL OR p.archived_at > NOW())
              LIMIT 1
            `
            return result[0] || null
          }),

        // Lifecycle queries
        getProductsByEffectiveDate: (
          at_date: Date,
          distribution?: "sellable" | "grant"
        ) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            return yield* sql<Product>`
              SELECT * FROM products 
              WHERE effective_at <= ${at_date}
              AND (archived_at IS NULL OR archived_at > ${at_date})
              ${distribution ? sql`AND distribution = ${distribution}` : sql``}
              ORDER BY created_at DESC
            `
          }),

        isProductActive: (product_code: string, at_date: Date = new Date()) =>
          Effect.gen(function*() {
            const sql = yield* db.getConnection(merchantContext.merchantId)
            const result = yield* sql<{ active: boolean }>`
              SELECT 
                CASE WHEN COUNT(*) > 0 THEN true ELSE false END as active
              FROM products 
              WHERE code = ${product_code}
              AND effective_at <= ${at_date}
              AND (archived_at IS NULL OR archived_at > ${at_date})
            `
            return result[0]?.active || false
          })
      }
    }),
    dependencies: [Layer.provide(DatabaseManagerLive, PgLayerFactoryLive)]
  }
) {}
