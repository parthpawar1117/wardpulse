export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  /** Standard normal (mean 0, sd 1). */
  normal(): number
}

export function createRng(_seed: number): Rng {
  throw new Error('not implemented')
}
