import { Rpc, RpcGroup } from "@effect/rpc"
import { Schema } from "effect"

export const Health = Schema.Struct({ status: Schema.Literal("ok") })

export const getHealthRpc = Rpc.make("getHealth", {
  success: Health,
  error: Schema.String
})

export const HealthRpcs = RpcGroup.make(getHealthRpc)
