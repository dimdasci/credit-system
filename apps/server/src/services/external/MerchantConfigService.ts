import { MerchantContext } from "@credit-system/shared"
import { MerchantConfig } from "@server/domain/merchants/MerchantConfig.js"
import { ServiceUnavailable } from "@server/domain/shared/DomainErrors.js"
import { Config, Effect, Option, Schema } from "effect"

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
      ): Effect.Effect<string, ServiceUnavailable> =>
        Config.option(Config.string(envVar)).pipe(
          Effect.flatMap(Option.match({
            onNone: () =>
              Effect.fail(
                new ServiceUnavailable({
                  service: "MerchantConfigService",
                  reason: "corrupted_configuration",
                  details: `Missing required configuration: ${envVar} for merchant ${merchantId}`
                })
              ),
            onSome: (value) => Effect.succeed(value)
          })),
          Effect.mapError(() =>
            new ServiceUnavailable({
              service: "MerchantConfigService",
              reason: "corrupted_configuration",
              details: `Error loading configuration: ${envVar} for merchant ${merchantId}`
            })
          )
        )

      const loadOptionalStringConfig = (
        envVar: string
      ): Effect.Effect<string | undefined, ServiceUnavailable> =>
        Config.option(Config.string(envVar)).pipe(
          Effect.map(Option.getOrUndefined),
          Effect.mapError(() =>
            new ServiceUnavailable({
              service: "MerchantConfigService",
              reason: "corrupted_configuration",
              details: `Error loading optional configuration: ${envVar}`
            })
          )
        )

      const loadOptionalNumberConfig = (
        envVar: string
      ): Effect.Effect<number | undefined, ServiceUnavailable> =>
        Config.option(Config.number(envVar)).pipe(
          Effect.map(Option.getOrUndefined),
          Effect.mapError(() =>
            new ServiceUnavailable({
              service: "MerchantConfigService",
              reason: "corrupted_configuration",
              details: `Error loading optional number configuration: ${envVar}`
            })
          )
        )

      return {
        // get config for current merchant context
        getCurrentMerchantConfig: (): Effect.Effect<
          MerchantConfig,
          ServiceUnavailable
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
                new ServiceUnavailable({
                  service: "MerchantConfigService",
                  reason: "data_corruption",
                  details: `Schema validation failed for merchant ${merchantId}: ${error.message}`
                })
              )
            )

            // Business validation
            if (!config.validateTaxConfiguration()) {
              return yield* Effect.fail(
                new ServiceUnavailable({
                  service: "MerchantConfigService",
                  reason: "corrupted_configuration",
                  details: `Invalid tax configuration for merchant ${merchantId}: VAT regime requires VAT rate`
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
