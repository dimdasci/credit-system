import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"

export const Version = Schema.Struct({
  version: Schema.String,
  commit: Schema.String,
  buildTime: Schema.String,
  nodeVersion: Schema.String,
  environment: Schema.String
})

export class VersionApiGroup extends HttpApiGroup.make("version")
  .add(
    HttpApiEndpoint.get("getVersion", "/version")
      .addSuccess(Version)
  )
{}
