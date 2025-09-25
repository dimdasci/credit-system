import { MerchantContext } from "@credit-system/shared"
import { MerchantConfig } from "@server/domain/merchants/MerchantConfig.js"
import { Config, Data, Effect, Option, Schema } from "effect"
import type { ConfigError } from "effect/ConfigError"

// Error types for merchant configuration
export class MissingMerchantConfigError extends Data.TaggedError("MissingMerchantConfigError")<{
  readonly merchantId: string
  readonly missingEnvVar: string
}> {}

export class InvalidMerchantConfigError extends Data.TaggedError("InvalidMerchantConfigError")<{
  readonly merchantId: string
  readonly reason: string
}> {}

export class MerchantConfigService extends Effect.Service<MerchantConfigService>()(
  "MerchantConfigService",
  {
    effect: Effect.gen(function*() {
      const merchantContext = yield* MerchantContext
      const configMap = new Map<string, MerchantConfig>()

      // Helper functions
      const loadRequiredConfig = (
        envVar: string,
        merchantId: string
      ): Effect.Effect<string, MissingMerchantConfigError | ConfigError> =>
        Config.option(Config.string(envVar)).pipe(
          Effect.flatMap(Option.match({
            onNone: () => Effect.fail(new MissingMerchantConfigError({ merchantId, missingEnvVar: envVar })),
            onSome: (value) => Effect.succeed(value)
          }))
        )

      const loadOptionalStringConfig = (
        envVar: string
      ): Effect.Effect<string | undefined, ConfigError> =>
        Config.option(Config.string(envVar)).pipe(
          Effect.map(Option.getOrUndefined)
        )

      const loadOptionalNumberConfig = (
        envVar: string
      ): Effect.Effect<number | undefined, ConfigError> =>
        Config.option(Config.number(envVar)).pipe(
          Effect.map(Option.getOrUndefined)
        )

      return {
        getMerchantConfig: (
          merchantId: string
        ): Effect.Effect<MerchantConfig, MissingMerchantConfigError | InvalidMerchantConfigError | ConfigError> =>
          Effect.gen(function*() {
            const prefix = merchantId.substring(0, 4).toUpperCase()

            // Return cached config if available
            if (configMap.has(prefix)) {
              return configMap.get(prefix)!
            }

            // Load configuration from environment variables
            const legalNameVar = `MERCHANT_${prefix}_LEGAL_NAME`
            const taxRegimeVar = `MERCHANT_${prefix}_TAX_REGIME`
            const vatRateVar = `MERCHANT_${prefix}_VAT_RATE`
            const receiptPrefixVar = `MERCHANT_${prefix}_RECEIPT_PREFIX`
            const addressVar = `MERCHANT_${prefix}_REGISTERED_ADDRESS`
            const countryVar = `MERCHANT_${prefix}_COUNTRY`
            const taxStatusNoteVar = `MERCHANT_${prefix}_TAX_STATUS_NOTE`
            const timeoutVar = `MERCHANT_${prefix}_OPERATION_TIMEOUT_MINUTES`
            const retentionVar = `MERCHANT_${prefix}_RETENTION_YEARS`

            // Required configs
            const legalName = yield* loadRequiredConfig(legalNameVar, merchantId)
            const taxRegime = yield* loadRequiredConfig(taxRegimeVar, merchantId)
            const receiptPrefix = yield* loadRequiredConfig(receiptPrefixVar, merchantId)
            const address = yield* loadRequiredConfig(addressVar, merchantId)
            const country = yield* loadRequiredConfig(countryVar, merchantId)

            // Optional configs with defaults
            const vatRate = yield* loadOptionalNumberConfig(vatRateVar)
            const taxStatusNote = yield* loadOptionalStringConfig(taxStatusNoteVar)
            const operationTimeoutMinutes = yield* loadOptionalNumberConfig(timeoutVar).pipe(
              Effect.map((value) => value ?? 30) // Default 30 minutes
            )
            const retentionYears = yield* loadOptionalNumberConfig(retentionVar).pipe(
              Effect.map((value) => value ?? 7) // Default 7 years
            )

            // Create and validate MerchantConfig
            const configData = {
              merchantId,
              legalName,
              registeredAddress: address,
              country,
              taxRegime: taxRegime as "vat" | "turnover" | "none",
              vatRate,
              taxStatusNote,
              receiptSeriesPrefix: receiptPrefix,
              operationTimeoutMinutes,
              retentionYears
            }

            const config = yield* Schema.decodeUnknown(MerchantConfig)(configData).pipe(
              Effect.mapError((error) =>
                new InvalidMerchantConfigError({
                  merchantId,
                  reason: `Schema validation failed: ${error.message}`
                })
              )
            )

            // Business validation
            if (!config.validateTaxConfiguration()) {
              return yield* Effect.fail(
                new InvalidMerchantConfigError({
                  merchantId,
                  reason: "Invalid tax configuration: VAT regime requires VAT rate"
                })
              )
            }

            // Cache the validated config
            configMap.set(prefix, config)
            return config
          }),

        // Convenience method to get config for current merchant context
        getCurrentMerchantConfig: (): Effect.Effect<
          MerchantConfig,
          MissingMerchantConfigError | InvalidMerchantConfigError | ConfigError
        > =>
          Effect.gen(function*() {
            const { merchantId } = merchantContext
            const prefix = merchantId.substring(0, 4).toUpperCase()

            // Return cached config if available
            if (configMap.has(prefix)) {
              return configMap.get(prefix)!
            }

            // Load same as getMerchantConfig but use context merchantId
            const legalNameVar = `MERCHANT_${prefix}_LEGAL_NAME`
            const taxRegimeVar = `MERCHANT_${prefix}_TAX_REGIME`
            const vatRateVar = `MERCHANT_${prefix}_VAT_RATE`
            const receiptPrefixVar = `MERCHANT_${prefix}_RECEIPT_PREFIX`
            const addressVar = `MERCHANT_${prefix}_REGISTERED_ADDRESS`
            const countryVar = `MERCHANT_${prefix}_COUNTRY`
            const taxStatusNoteVar = `MERCHANT_${prefix}_TAX_STATUS_NOTE`
            const timeoutVar = `MERCHANT_${prefix}_OPERATION_TIMEOUT_MINUTES`
            const retentionVar = `MERCHANT_${prefix}_RETENTION_YEARS`

            // Required configs
            const legalName = yield* loadRequiredConfig(legalNameVar, merchantId)
            const taxRegime = yield* loadRequiredConfig(taxRegimeVar, merchantId)
            const receiptPrefix = yield* loadRequiredConfig(receiptPrefixVar, merchantId)
            const address = yield* loadRequiredConfig(addressVar, merchantId)
            const country = yield* loadRequiredConfig(countryVar, merchantId)

            // Optional configs with defaults
            const vatRate = yield* loadOptionalNumberConfig(vatRateVar)
            const taxStatusNote = yield* loadOptionalStringConfig(taxStatusNoteVar)
            const operationTimeoutMinutes = yield* loadOptionalNumberConfig(timeoutVar).pipe(
              Effect.map((value) => value ?? 30) // Default 30 minutes
            )
            const retentionYears = yield* loadOptionalNumberConfig(retentionVar).pipe(
              Effect.map((value) => value ?? 7) // Default 7 years
            )

            // Create and validate MerchantConfig
            const configData = {
              merchantId,
              legalName,
              registeredAddress: address,
              country,
              taxRegime: taxRegime as "vat" | "turnover" | "none",
              vatRate,
              taxStatusNote,
              receiptSeriesPrefix: receiptPrefix,
              operationTimeoutMinutes,
              retentionYears
            }

            const config = yield* Schema.decodeUnknown(MerchantConfig)(configData).pipe(
              Effect.mapError((error) =>
                new InvalidMerchantConfigError({
                  merchantId,
                  reason: `Schema validation failed: ${error.message}`
                })
              )
            )

            // Business validation
            if (!config.validateTaxConfiguration()) {
              return yield* Effect.fail(
                new InvalidMerchantConfigError({
                  merchantId,
                  reason: "Invalid tax configuration: VAT regime requires VAT rate"
                })
              )
            }

            // Cache the validated config
            configMap.set(prefix, config)
            return config
          })
      }
    })
  }
) {}
