import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"

export const GenerateMerchantTokenRequest = Schema.Struct({})

export const GenerateMerchantTokenResponse = Schema.Struct({
  merchantId: Schema.String,
  token: Schema.String
})

export const AdminApiGroup = HttpApiGroup.make("admin")
  .add(
    HttpApiEndpoint.post("generateMerchantToken", "/admin/generate-merchant-token")
      .addSuccess(GenerateMerchantTokenResponse)
      .setPayload(GenerateMerchantTokenRequest)
  )

export const AdminApi = HttpApi.make("api").add(AdminApiGroup)
