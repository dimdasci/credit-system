import { Schema } from "@effect/schema"

// Credits value object - integer credits for ledger amounts
export const Credits = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(0),
  Schema.brand("Credits")
)

export type Credits = Schema.Schema.Type<typeof Credits>

// Utility functions
export const zero = (): Credits => 0 as Credits

export const add = (a: Credits, b: Credits): Credits => ((a as number) + (b as number)) as Credits

export const subtract = (a: Credits, b: Credits): Credits => ((a as number) - (b as number)) as Credits

export const isPositive = (credits: Credits): boolean => (credits as number) > 0

export const isZero = (credits: Credits): boolean => (credits as number) === 0
