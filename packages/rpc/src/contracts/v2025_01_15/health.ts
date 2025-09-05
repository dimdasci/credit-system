import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"

export const Health = Schema.Struct({ status: Schema.Literal("ok") })

export class HealthApiGroup extends HttpApiGroup.make("health")
  .add(
    HttpApiEndpoint.get("getHealth", "/health")
      .addSuccess(Health)
  )
{}

export class HealthApi extends HttpApi.make("api").add(HealthApiGroup) {}
