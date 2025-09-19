import { AdminPublicRpcs, AdminRpcs } from "@credit-system/rpc"
import { MerchantContext } from "@credit-system/shared"
import { TokenService } from "@server/services/business/TokenService.js"
import { Effect } from "effect"
import { Authorization } from "../middleware/AuthorizationMiddleware.js"

export const AdminPublicHandlers = AdminPublicRpcs.toLayer({
  generateMerchantToken: () =>
    Effect.gen(function*() {
      const tokenService = yield* TokenService
      return yield* tokenService.generateMerchantToken()
    })
})

export const ProtectedAdminRpcs = AdminRpcs.middleware(Authorization)

export const AdminHandlers = ProtectedAdminRpcs.toLayer({
  getMerchantId: () =>
    Effect.gen(function*() {
      const merchantContext = yield* MerchantContext
      return { merchantId: merchantContext.merchantId }
    })
})
