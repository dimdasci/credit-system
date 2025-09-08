import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"

export const Health = Schema.Struct({ status: Schema.Literal("ok") })

export const HealthApiGroup = HttpApiGroup.make("health")
  .add(
    HttpApiEndpoint.get("getHealth", "/health")
      .addSuccess(Health)
  )

export const HealthApi = HttpApi.make("api").add(HealthApiGroup)
