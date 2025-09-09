import { Context } from "effect"

export interface MerchantContext {
  readonly merchantId: string
  readonly serviceAccountId: string
}

export const MerchantContext = Context.GenericTag<MerchantContext>("MerchantContext")