import { ServerConfig } from "@credit-system/shared"
import { HttpApiBuilder, HttpMiddleware, HttpServer } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { ConfigProvider, Effect, Layer } from "effect"
import { createServer } from "node:http"
import { ApiLive } from "./Api.js"

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

const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(ApiLive),
  HttpServer.withLogAddress,
  Layer.provide(NodeServerFromConfig)
)

const main = Layer.launch(HttpLive) as Effect.Effect<never, unknown, never>
NodeRuntime.runMain(main)
