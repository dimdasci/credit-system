import { Command } from "@effect/cli"
import { AdminClient } from "./AdminClient.js"
import { HealthClient } from "./HealthClient.js"

const ping = Command.make("health").pipe(
  Command.withDescription("Check server health"),
  Command.withHandler(() => HealthClient.ping)
)

const generateMerchantToken = Command.make("generate-merchant-token").pipe(
  Command.withDescription("Generate a merchant token for testing"),
  Command.withHandler(() => AdminClient.generateMerchantToken)
)

const cli = Command.make("credit-system").pipe(
  Command.withSubcommands([ping, generateMerchantToken])
)

export const main = Command.run(cli, {
  name: "Credit System CLI",
  version: "0.0.1"
})
