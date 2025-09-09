import { AdminApiGroup } from "@credit-system/rpc"
import { HttpApi, HttpApiClient } from "@effect/platform"
import { Effect } from "effect"
import { CliConfig } from "./CliConfig.js"

const AdminApi = HttpApi.make("api").add(AdminApiGroup)

export class AdminClient extends Effect.Service<AdminClient>()("cli/AdminClient", {
  accessors: true,
  effect: Effect.gen(function*() {
    const config = yield* CliConfig
    const baseUrl = `http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`

    const client = yield* HttpApiClient.make(AdminApi, {
      baseUrl
    })

    const generateMerchantToken = client.admin.generateMerchantToken({ payload: {} }).pipe(
      Effect.flatMap((res) =>
        Effect.gen(function*() {
          yield* Effect.logInfo(`Generated merchant token:`)
          yield* Effect.logInfo(`Merchant ID: ${res.merchantId}`)
          yield* Effect.logInfo(`JWT Token: ${res.token}`)
          return res
        })
      )
    )

    return { generateMerchantToken } as const
  })
}) {}
