import { describe, expect, it } from 'vitest'
import { createPpgGenerator, SAMPLE_RATE } from './ppg'
import { createRng } from './rng'
import type { TruthVitals } from './scenario'

const truth = (over: Partial<TruthVitals> = {}): TruthVitals => ({
  hr: 75,
  spo2: 97,
  pi: 2.5,
  motion: false,
  sensorOff: false,
  lossProbability: 0,
  ...over,
})

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const sd = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}
const ac = (xs: number[]) => Math.max(...xs) - Math.min(...xs)

/** Counts pulses with hysteresis so noise near the midline is not double-counted. */
function countBeats(xs: number[]): number {
  const m = mean(xs)
  const band = 0.25 * ac(xs)
  let armed = false
  let beats = 0
  for (const x of xs) {
    if (x > m + band) armed = true
    if (armed && x < m - band) {
      beats++
      armed = false
    }
  }
  return beats
}

/** Classic empirical oximetry calibration, the inverse of what the generator uses. */
function estimateSpo2(ir: number[], red: number[]): number {
  const r = ac(red) / mean(red) / (ac(ir) / mean(ir))
  return 110 - 25 * r
}

const seconds = (s: number) => s * SAMPLE_RATE

describe('createPpgGenerator', () => {
  it('produces the requested number of finite samples on both channels', () => {
    const { ir, red } = createPpgGenerator(createRng(1)).generate(truth(), 25)
    expect(ir).toHaveLength(25)
    expect(red).toHaveLength(25)
    expect([...ir, ...red].every(Number.isFinite)).toBe(true)
  })

  it.each([60, 75, 120])('encodes a heart rate of %i bpm in the pulse count', (hr) => {
    const { ir } = createPpgGenerator(createRng(2)).generate(truth({ hr }), seconds(20))
    expect(Math.abs(countBeats(ir) - (hr * 20) / 60)).toBeLessThanOrEqual(1)
  })

  it.each([97, 92, 87])('encodes SpO2 %i%% recoverable by ratio-of-ratios', (spo2) => {
    const { ir, red } = createPpgGenerator(createRng(3)).generate(truth({ spo2 }), seconds(10))
    expect(Math.abs(estimateSpo2(ir, red) - spo2)).toBeLessThan(2)
  })

  it('encodes the perfusion index as AC/DC', () => {
    const { ir } = createPpgGenerator(createRng(4)).generate(truth({ pi: 2.5 }), seconds(10))
    const measured = (ac(ir) / mean(ir)) * 100
    expect(measured).toBeGreaterThan(2.5 * 0.8)
    expect(measured).toBeLessThan(2.5 * 1.3)
  })

  it('is continuous across calls: two halves equal one whole', () => {
    const whole = createPpgGenerator(createRng(5)).generate(truth(), 100)
    const split = createPpgGenerator(createRng(5))
    const a = split.generate(truth(), 50)
    const b = split.generate(truth(), 50)
    expect([...a.ir, ...b.ir]).toEqual(whole.ir)
    expect([...a.red, ...b.red]).toEqual(whole.red)
  })

  it('swamps the pulse with large artefact during motion', () => {
    const calm = createPpgGenerator(createRng(6)).generate(truth(), seconds(10))
    const moving = createPpgGenerator(createRng(6)).generate(truth({ motion: true }), seconds(10))
    expect(sd(moving.ir)).toBeGreaterThan(5 * sd(calm.ir))
  })

  it('drops to ambient light with no pulse when the sensor is off', () => {
    const on = createPpgGenerator(createRng(7)).generate(truth(), seconds(5))
    const off = createPpgGenerator(createRng(7)).generate(truth({ sensorOff: true }), seconds(5))
    expect(mean(off.ir)).toBeLessThan(0.1 * mean(on.ir))
    expect(ac(off.ir)).toBeLessThan(0.1 * ac(on.ir))
  })
})
