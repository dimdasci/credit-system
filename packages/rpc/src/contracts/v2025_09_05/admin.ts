import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"

export const GenerateMerchantTokenRequest = Schema.Struct({})

export const GenerateMerchantTokenResponse = Schema.Struct({
  merchantId: Schema.String,
  token: Schema.String
})

export const GetMerchantIdRequest = Schema.Struct({})

export const GetMerchantIdResponse = Schema.Struct({
  merchantId: Schema.String
})

export const AdminApiPublicGroup = HttpApiGroup.make("admin-public")
  .add(
    HttpApiEndpoint.post("generateMerchantToken", "/admin/generate-merchant-token")
      .addSuccess(GenerateMerchantTokenResponse)
      .setPayload(GenerateMerchantTokenRequest)
  )

export const AdminApiPublic = HttpApi.make("api").add(AdminApiPublicGroup)

export const AdminApiGroup = HttpApiGroup.make("admin")
  .add(
    HttpApiEndpoint.get("getMerchantId", "/admin/merchant-id")
      .addSuccess(GetMerchantIdResponse)
  )

export const AdminApi = HttpApi.make("api").add(AdminApiGroup)
