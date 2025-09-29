import { Effect } from "effect"
import { CliConfig } from "./CliConfig.js"

export class HealthClient extends Effect.Service<HealthClient>()("cli/HealthClient", {
  accessors: true,
  effect: Effect.gen(function*() {
    const config = yield* CliConfig
    const baseUrl = `http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`

    const ping = Effect.gen(function*() {
      yield* Effect.logWarning(
        "CLI health check is not wired yet. Use curl to POST a getHealth RPC request."
      )
      yield* Effect.logWarning(`Endpoint: ${baseUrl}/rpc`)
    })

    return { ping } as const
  })
}) {}
