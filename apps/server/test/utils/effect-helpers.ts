import type { Either } from "effect"
import { Effect } from "effect"
import { expect } from "vitest"

// Run an Effect and capture Either result synchronously
export const runTestEffect = <A, E>(effect: Effect.Effect<A, E>): Either.Either<A, E> => {
  return Effect.runSync(Effect.either(effect)) as Either.Either<A, E>
}

// Assertion helpers for Effect results
export const expectRight = <A, E>(result: Either.Either<A, E>): A => {
  expect((result as any)._tag).toBe("Right")
  return (result as any).right as A
}

export const expectLeft = <A, E>(result: Either.Either<A, E>): E => {
  expect((result as any)._tag).toBe("Left")
  return (result as any).left as E
}

// Effect test wrapper that handles common patterns
export const testEffect = <A, E>(
  name: string,
  effect: Effect.Effect<A, E>,
  assertion: (result: Either.Either<A, E>) => void
) => {
  return it(name, () => {
    const result = runTestEffect(effect)
    assertion(result)
  })
}
