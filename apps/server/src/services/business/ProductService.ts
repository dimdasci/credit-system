import type { Product } from "@server/domain/products/Product.js"
import { ProductUnavailable, ServiceUnavailable } from "@server/domain/shared/DomainErrors.js"
import { ProductRepository } from "@server/services/repositories/ProductRepository.js"
import { Effect } from "effect"

export class ProductService extends Effect.Service<ProductService>()("ProductService", {
  effect: Effect.gen(function*() {
    const productRepo = yield* ProductRepository

    const validateProductForPricing = (
      product_code: string,
      at_time: Date
    ): Effect.Effect<Product, ProductUnavailable | ServiceUnavailable> =>
      Effect.gen(function*() {
        // Get sellable products active at specified time
        const products = yield* productRepo.getProductsByEffectiveDate(at_time, "sellable")
          .pipe(Effect.mapError(() =>
            new ServiceUnavailable({
              service: "ProductService",
              reason: "database_connection_failure",
              details: `Failed to retrieve products for pricing validation: ${product_code}`
            })
          ))

        const product = products.find((p) => p.product_code === product_code)

        if (!product) {
          return yield* Effect.fail(
            new ProductUnavailable({
              product_code,
              reason: "not_found"
            })
          )
        }

        return product
      })

    return { validateProductForPricing } as const
  }),
  dependencies: [ProductRepository.Default]
}) {}
