import { HealthApi } from "@credit-system/rpc"
import { HttpApiClient } from "@effect/platform"
import { Effect } from "effect"
import { CliConfig } from "./CliConfig.js"

export class HealthClient extends Effect.Service<HealthClient>()("cli/HealthClient", {
  accessors: true,
  effect: Effect.gen(function*() {
    const config = yield* CliConfig
    const baseUrl = `http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`
    
    const client = yield* HttpApiClient.make(HealthApi, {
      baseUrl
    })

    const ping = client.health.getHealth().pipe(
      Effect.flatMap((res) => Effect.logInfo(res))
    )

    return { ping } as const
  })
}) {}
