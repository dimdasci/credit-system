import { HealthApi } from "@credit-system/rpc"
import { HttpApiClient } from "@effect/platform"
import { Effect } from "effect"

export class HealthClient extends Effect.Service<HealthClient>()("cli/HealthClient", {
  accessors: true,
  effect: Effect.gen(function*() {
    const client = yield* HttpApiClient.make(HealthApi, {
      baseUrl: "http://localhost:3000"
    })

    const ping = client.health.getHealth().pipe(
      Effect.flatMap((res) => Effect.logInfo(res))
    )

    return { ping } as const
  })
}) {}
