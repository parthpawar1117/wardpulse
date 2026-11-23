/**
 * Slow-deterioration detector for one vital sign.
 *
 * Threshold alarms only fire once a vital crosses a fixed line such as
 * HR > 110. A patient who drifts from 82 to 105 over half an hour never trips
 * one, even though the drift itself is the warning. CUSUM (cumulative sum)
 * catches that: it adds up how far each reading sits beyond the patient's own
 * baseline, minus an allowance for normal variation, and alarms when the total
 * grows large. Noise cancels out; a sustained drift keeps adding.
 *
 * Readings are averaged into blocks first, which cuts one-second jitter, and
 * an EWMA (exponentially weighted moving average) gives the console a smoothed
 * value to display.
 */

export interface TrendConfig {
  /** 'up' watches for rises (heart rate), 'down' for falls (SpO2). */
  direction: 'up' | 'down'
  /** Shift per block, in the vital's units, treated as normal variation. */
  allowance: number
  /** Cumulative evidence, in vital units × blocks, that raises the alarm. */
  threshold: number
  /** Valid readings averaged into each block. Default 10. */
  blockSeconds?: number
  /** Blocks used to learn the patient's baseline. Default 6. */
  warmupBlocks?: number
  /** EWMA weight of the newest reading, 0 to 1. Default 0.1. */
  alpha?: number
}

export interface TrendState {
  /** Patient's own baseline, or null while still learning it. */
  baseline: number | null
  /** Smoothed latest value, or null before the first reading. */
  ewma: number | null
  /** Accumulated evidence of drift, from 0 (none) up to twice the threshold. */
  cusum: number
  /** True while cusum is at or above the threshold. */
  alarm: boolean
}

export interface TrendDetector {
  /** Call once per second. Pass null when the reading is missing or untrusted. */
  update(value: number | null): TrendState
  reset(): void
}

/** A sustained HR rise of more than 4 bpm, adding up to 30 bpm·blocks. */
export const HR_RISE: TrendConfig = { direction: 'up', allowance: 4, threshold: 30 }
/** A sustained SpO2 fall of more than 0.75 points, adding up to 4 point·blocks. */
export const SPO2_FALL: TrendConfig = { direction: 'down', allowance: 0.75, threshold: 4 }

const round3 = (x: number) => Math.round(x * 1000) / 1000

export function createTrendDetector(cfg: TrendConfig): TrendDetector {
  const blockSeconds = cfg.blockSeconds ?? 10
  const warmupBlocks = cfg.warmupBlocks ?? 6
  const alpha = cfg.alpha ?? 0.1
  const sign = cfg.direction === 'up' ? 1 : -1

  let block: number[] = []
  let warmup: number[] = []
  let baseline: number | null = null
  let ewma: number | null = null
  let cusum = 0

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

  const state = (): TrendState => ({ baseline, ewma, cusum, alarm: cusum >= cfg.threshold })

  const update = (value: number | null): TrendState => {
    if (value === null) return state()

    ewma = ewma === null ? value : round3(alpha * value + (1 - alpha) * ewma)
    block.push(value)
    if (block.length < blockSeconds) return state()

    const blockMean = mean(block)
    block = []

    if (baseline === null) {
      warmup.push(blockMean)
      if (warmup.length === warmupBlocks) baseline = round3(mean(warmup))
      return state()
    }

    // Capped at twice the threshold: enough to hold the alarm through a brief
    // dip, but a recovered patient drains below the threshold within minutes.
    cusum = round3(Math.min(2 * cfg.threshold, Math.max(0, cusum + sign * (blockMean - baseline) - cfg.allowance)))
    return state()
  }

  const reset = () => {
    block = []
    warmup = []
    baseline = null
    ewma = null
    cusum = 0
  }

  return { update, reset }
}
