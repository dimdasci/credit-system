import { Command } from "@effect/cli"
import { HealthClient } from "./HealthClient.js"

const ping = Command.make("health").pipe(
  Command.withDescription("Check server health"),
  Command.withHandler(() => HealthClient.ping)
)

export const cli = Command.run(ping, {
  name: "Credit System CLI",
  version: "0.0.0"
})
