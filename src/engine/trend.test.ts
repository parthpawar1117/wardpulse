import { describe, expect, it } from 'vitest'
import { createTrendDetector, HR_RISE, SPO2_FALL, type TrendConfig } from './trend'

const cfg: TrendConfig = { direction: 'up', allowance: 4, threshold: 30, blockSeconds: 10, warmupBlocks: 6 }

/** Feeds a series one value per second and returns every state. */
const run = (c: TrendConfig, series: (number | null)[]) => {
  const d = createTrendDetector(c)
  return series.map((x) => d.update(x))
}
const constant = (value: number, seconds: number) => Array<number>(seconds).fill(value)

describe('createTrendDetector', () => {
  it('learns the baseline from the warm-up blocks', () => {
    const states = run(cfg, [...constant(80, 30), ...constant(84, 30)])
    expect(states[58].baseline).toBeNull()
    expect(states[59].baseline).toBe(82)
  })

  it('never alarms on a steady patient', () => {
    const states = run(cfg, constant(80, 3600))
    expect(states.some((s) => s.alarm)).toBe(false)
    expect(states[3599].cusum).toBe(0)
  })

  it('ignores a shift smaller than the allowance', () => {
    const states = run(cfg, [...constant(80, 60), ...constant(83, 3600)])
    expect(states.some((s) => s.alarm)).toBe(false)
  })

  it('alarms on a sustained shift once the evidence adds up', () => {
    // Each block contributes 10 − 4 = 6, so the fifth block after warm-up crosses 30.
    const states = run(cfg, [...constant(80, 60), ...constant(90, 60)])
    const first = states.findIndex((s) => s.alarm)
    expect(first).toBe(60 + 5 * 10 - 1)
    expect(states[first].cusum).toBe(30)
  })

  it('ignores a shift in the other direction', () => {
    const states = run(cfg, [...constant(80, 60), ...constant(60, 600)])
    expect(states.some((s) => s.alarm)).toBe(false)
  })

  it('watches for falls when the direction is down', () => {
    const c: TrendConfig = { ...cfg, direction: 'down', allowance: 0.75, threshold: 4 }
    const states = run(c, [...constant(97, 60), ...constant(94, 60)])
    expect(states.some((s) => s.alarm)).toBe(true)
  })

  it('skips missing values instead of counting them as zero', () => {
    const gappy = constant(80, 120).map((x, i) => (i % 3 === 0 ? null : x))
    const states = run(cfg, gappy)
    expect(states[119].baseline).toBe(80)
    expect(states.some((s) => s.alarm)).toBe(false)
  })

  it('clears the alarm when the patient recovers', () => {
    const states = run(cfg, [...constant(80, 60), ...constant(90, 60), ...constant(70, 120)])
    expect(states[119].alarm).toBe(true)
    expect(states[239].alarm).toBe(false)
  })

  it('smooths the latest value with an EWMA', () => {
    const states = run({ ...cfg, alpha: 0.5 }, [80, 90])
    expect(states[0].ewma).toBe(80)
    expect(states[1].ewma).toBe(85)
  })

  it('starts over on reset', () => {
    const d = createTrendDetector(cfg)
    for (const x of constant(80, 60)) d.update(x)
    d.reset()
    expect(d.update(80).baseline).toBeNull()
  })

  it('ships clinically sized defaults for HR and SpO2', () => {
    expect(HR_RISE.direction).toBe('up')
    expect(SPO2_FALL.direction).toBe('down')
  })
})
