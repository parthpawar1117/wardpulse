import { describe, expect, it } from 'vitest'
import { createRng } from './rng'
import { vitalsAt, type BedScenario } from './scenario'

const baseline = { hr: 80, spo2: 97, pi: 2.5 }
const bed = (events: BedScenario['events'] = []): BedScenario => ({ baseline, events })

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = [a.next(), a.next(), a.next(), a.next()]
    const seqB = [b.next(), b.next(), b.next(), b.next()]
    expect(seqA).toEqual(seqB)
  })

  it('gives different sequences for different seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next())
  })

  it('returns uniform values in [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const x = rng.next()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it('produces standard normal samples', () => {
    const rng = createRng(9)
    const xs = Array.from({ length: 5000 }, () => rng.normal())
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length)
    expect(Math.abs(mean)).toBeLessThan(0.1)
    expect(Math.abs(sd - 1)).toBeLessThan(0.1)
  })
})

describe('vitalsAt', () => {
  it('returns the baseline with no flags for a stable patient', () => {
    for (const t of [0, 600, 3600]) {
      expect(vitalsAt(bed(), t)).toEqual({
        ...baseline,
        motion: false,
        sensorOff: false,
        lossProbability: 0,
      })
    }
  })

  it('ramps a slow deterioration linearly and then holds it', () => {
    const s = bed([{ kind: 'deterioration', start: 100, duration: 400, hrDelta: 40, spo2Delta: -4 }])
    expect(vitalsAt(s, 100).hr).toBe(80)
    expect(vitalsAt(s, 300).hr).toBeCloseTo(100)
    expect(vitalsAt(s, 300).spo2).toBeCloseTo(95)
    expect(vitalsAt(s, 9999).hr).toBeCloseTo(120)
    expect(vitalsAt(s, 9999).spo2).toBeCloseTo(93)
  })

  it('drives acute hypoxia to its target over the onset period', () => {
    const s = bed([{ kind: 'hypoxia', start: 50, onset: 60, spo2Target: 87, hrDelta: 30 }])
    expect(vitalsAt(s, 49).spo2).toBe(97)
    expect(vitalsAt(s, 110).spo2).toBeCloseTo(87)
    expect(vitalsAt(s, 110).hr).toBeCloseTo(110)
    expect(vitalsAt(s, 500).spo2).toBeCloseTo(87)
  })

  it('flags motion only inside its window', () => {
    const s = bed([{ kind: 'motion', start: 40, duration: 30 }])
    expect(vitalsAt(s, 39).motion).toBe(false)
    expect(vitalsAt(s, 40).motion).toBe(true)
    expect(vitalsAt(s, 69).motion).toBe(true)
    expect(vitalsAt(s, 70).motion).toBe(false)
  })

  it('flags a detached sensor only inside its window', () => {
    const s = bed([{ kind: 'sensor-off', start: 10, duration: 5 }])
    expect(vitalsAt(s, 12).sensorOff).toBe(true)
    expect(vitalsAt(s, 15).sensorOff).toBe(false)
  })

  it('applies packet-loss probability only inside its window', () => {
    const s = bed([{ kind: 'packet-loss', start: 300, duration: 180, probability: 0.35 }])
    expect(vitalsAt(s, 299).lossProbability).toBe(0)
    expect(vitalsAt(s, 400).lossProbability).toBe(0.35)
    expect(vitalsAt(s, 480).lossProbability).toBe(0)
  })

  it('keeps truth values physiologically bounded', () => {
    const s = bed([{ kind: 'deterioration', start: 0, duration: 1, hrDelta: 900, spo2Delta: -90 }])
    const v = vitalsAt(s, 10)
    expect(v.hr).toBeLessThanOrEqual(250)
    expect(v.spo2).toBeGreaterThanOrEqual(60)
  })
})
