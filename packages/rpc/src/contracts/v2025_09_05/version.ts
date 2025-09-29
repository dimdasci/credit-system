import { Rpc, RpcGroup } from "@effect/rpc"
import { Schema } from "effect"

export const Version = Schema.Struct({
  version: Schema.String,
  commit: Schema.String,
  buildTime: Schema.String,
  nodeVersion: Schema.String,
  environment: Schema.String
})

export const getVersionRpc = Rpc.make("getVersion", {
  success: Version,
  error: Schema.String
})

export const VersionRpcs = RpcGroup.make(getVersionRpc)
