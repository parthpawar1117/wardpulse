import type { Rng } from './rng'
import type { TruthVitals } from './scenario'

/** Samples per second, a common MAXREFDES117 configuration. */
export const SAMPLE_RATE = 25

export interface PpgFrame {
  ir: number[]
  red: number[]
}

export interface PpgGenerator {
  generate(vitals: TruthVitals, n: number): PpgFrame
}

export function createPpgGenerator(_rng: Rng): PpgGenerator {
  throw new Error('not implemented')
}
