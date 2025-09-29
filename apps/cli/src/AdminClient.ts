import { Effect } from "effect"
import { CliConfig } from "./CliConfig.js"

export class AdminClient extends Effect.Service<AdminClient>()("cli/AdminClient", {
  accessors: true,
  effect: Effect.gen(function*() {
    const config = yield* CliConfig
    const baseUrl = `http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`

    const generateMerchantToken = Effect.gen(function*() {
      yield* Effect.logWarning(
        "CLI token generation is not wired yet. Hit the admin-public.generateMerchantToken RPC via POST"
      )
      yield* Effect.logWarning(`Endpoint: ${baseUrl}/rpc`)
    })

    return { generateMerchantToken } as const
  })
}) {}
