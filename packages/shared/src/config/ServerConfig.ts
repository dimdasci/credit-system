import { Config } from "effect"

export const ServerConfig = Config.all({
  port: Config.number("PORT").pipe(Config.withDefault(3000)),
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  nodeEnv: Config.string("RAILWAY_ENVIRONMENT_NAME").pipe(
    Config.orElse(() => Config.string("NODE_ENV"))
  ).pipe(Config.withDefault("development")),
  logLevel: Config.string("LOG_LEVEL").pipe(Config.withDefault("info")),
  jwtSecret: Config.redacted("JWT_SECRET")
})
