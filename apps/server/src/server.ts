import { AdminPublicRpcs, AdminRpcs, HealthRpcs, VersionRpcs } from "@credit-system/rpc"
import { ServerConfig } from "@credit-system/shared"
import { HttpLayerRouter } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { RpcSerialization, RpcServer } from "@effect/rpc"
import { ConfigProvider, Effect, Layer } from "effect"
import { createServer } from "node:http"
import { AdminHandlers, AdminPublicHandlers } from "./application/rpc/handlers/AdminHandler.js"
import { HealthHandlers } from "./application/rpc/handlers/HealthHandler.js"
import { VersionHandlers } from "./application/rpc/handlers/VersionHandler.js"
import { TokenServiceLive } from "./services/business/TokenService.js"
import { DatabaseManagerLive, PgLayerFactoryLive } from "./services/external/DatabaseManagerImpl.js"

// Provide env-backed ConfigProvider inside the server layer to avoid residual requirements
const EnvProvider = Layer.setConfigProvider(ConfigProvider.fromEnv())

const NodeServerFromConfig = Layer.unwrapEffect(
  Effect.gen(function*() {
    const config = yield* ServerConfig
    const { host, nodeEnv, port } = config
    yield* Effect.logInfo(`Server starting in ${nodeEnv} environment`)
    return NodeHttpServer.layer(createServer, { host, port })
  })
).pipe(Layer.provide(EnvProvider))

const DatabaseLive = Layer.provide(DatabaseManagerLive, PgLayerFactoryLive)

// Combine all RPC groups into a single unified endpoint
const AllRpcs = HealthRpcs
  .merge(VersionRpcs)
  .merge(AdminPublicRpcs)
  .merge(AdminRpcs)

// Create single RPC endpoint
const RpcLayers = RpcServer.layerHttpRouter({
  group: AllRpcs,
  path: "/rpc",
  protocol: "http"
})

const HttpLive = HttpLayerRouter.serve(RpcLayers, {}).pipe(
  Layer.provide(RpcSerialization.layerJsonRpc()),
  Layer.provide(HealthHandlers),
  Layer.provide(VersionHandlers),
  Layer.provide(AdminPublicHandlers),
  Layer.provide(AdminHandlers),
  Layer.provide(TokenServiceLive),
  Layer.provide(DatabaseLive),
  Layer.provide(NodeServerFromConfig)
)

const main = Layer.launch(HttpLive) as Effect.Effect<never, unknown, never>
NodeRuntime.runMain(main)
