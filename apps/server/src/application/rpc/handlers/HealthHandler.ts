import { HealthRpcs } from "@credit-system/rpc"
import { Effect } from "effect"

export const HealthHandlers = HealthRpcs.toLayer({
  getHealth: () => Effect.succeed({ status: "ok" as const })
})
