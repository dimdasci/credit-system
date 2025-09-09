#!/usr/bin/env node

import { NodeContext, NodeHttpClient, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { AdminClient } from "./AdminClient.js"
import { main } from "./Cli.js"
import { HealthClient } from "./HealthClient.js"

const MainLive = HealthClient.Default.pipe(
  Layer.merge(AdminClient.Default),
  Layer.provide(NodeHttpClient.layerUndici),
  Layer.merge(NodeContext.layer)
)

main(process.argv).pipe(
  Effect.provide(MainLive),
  NodeRuntime.runMain
)
