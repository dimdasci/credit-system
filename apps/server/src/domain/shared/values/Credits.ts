import { Schema } from "effect"

// Credits unit: branded non-zero integer used across domain
export const Credits = Schema.Number.pipe(
  Schema.int(),
  Schema.filter((n) => n !== 0),
  Schema.brand("Credits")
)

export type Credits = Schema.Schema.Type<typeof Credits>

// Utility functions
// Note: Credits is non-zero by design; return number for arithmetic that may be zero
export const add = (a: Credits, b: Credits): number => (a as number) + (b as number)

export const subtract = (a: Credits, b: Credits): number => (a as number) - (b as number)

export const isPositive = (credits: Credits | number): boolean => (credits as number) > 0

export const isZero = (value: number): boolean => value === 0
