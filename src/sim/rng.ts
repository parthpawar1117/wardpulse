export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  /** Standard normal (mean 0, sd 1). */
  normal(): number
}

/**
 * Seeded PRNG (mulberry32) with Box–Muller normals.
 * Same seed, same ward: tests are repeatable and every demo recording is identical.
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0
  let spare: number | null = null

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const normal = (): number => {
    if (spare !== null) {
      const s = spare
      spare = null
      return s
    }
    // 1 - next() is in (0, 1], so log() never sees zero.
    const u = 1 - next()
    const v = next()
    const r = Math.sqrt(-2 * Math.log(u))
    spare = r * Math.sin(2 * Math.PI * v)
    return r * Math.cos(2 * Math.PI * v)
  }

  return { next, normal }
}
