import { Context } from "effect"

export interface MerchantContext {
  readonly merchantId: string
}

export const MerchantContext = Context.GenericTag<MerchantContext>("MerchantContext")
