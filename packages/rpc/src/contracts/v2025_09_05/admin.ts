import { Rpc, RpcGroup } from "@effect/rpc"
import { Schema } from "effect"

export const GenerateMerchantTokenResponse = Schema.Struct({
  merchantId: Schema.String,
  token: Schema.String
})

export const GetMerchantIdResponse = Schema.Struct({
  merchantId: Schema.String
})

export const generateMerchantTokenRpc = Rpc.make("generateMerchantToken", {
  success: GenerateMerchantTokenResponse,
  error: Schema.String
})

export const getMerchantIdRpc = Rpc.make("getMerchantId", {
  success: GetMerchantIdResponse,
  error: Schema.String
})

export const AdminPublicRpcs = RpcGroup.make(generateMerchantTokenRpc)
export const AdminRpcs = RpcGroup.make(getMerchantIdRpc)
