import { describe, expect, it } from 'vitest'
import type { Packet } from '../schema/packet'
import { createPpgGenerator, SAMPLE_RATE } from '../sim/ppg'
import { createRng } from '../sim/rng'
import type { TruthVitals } from '../sim/scenario'
import { createSqiTracker, signalQuality } from './sqi'

const truth = (over: Partial<TruthVitals> = {}): TruthVitals => ({
  hr: 80,
  spo2: 97,
  pi: 2.5,
  motion: false,
  sensorOff: false,
  lossProbability: 0,
  ...over,
})

const window = (v: TruthVitals, seconds: number, seed = 1) =>
  createPpgGenerator(createRng(seed)).generate(v, seconds * SAMPLE_RATE).ir

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

describe('signalQuality', () => {
  it('scores a clean signal high and recovers the pulse rate', () => {
    for (const hr of [55, 80, 120]) {
      const r = signalQuality(window(truth({ hr }), 8))
      expect(r.sqi).toBeGreaterThanOrEqual(0.8)
      expect(r.reasons).toEqual([])
      expect(r.hr).toBeGreaterThan(hr - 3)
      expect(r.hr).toBeLessThan(hr + 3)
    }
  })

  it('estimates perfusion index from the waveform', () => {
    const r = signalQuality(window(truth({ pi: 2.5 }), 8))
    expect(r.pi).toBeGreaterThan(2)
    expect(r.pi).toBeLessThan(3)
  })

  it('scores motion artefact low', () => {
    const scores = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((seed) => signalQuality(window(truth({ motion: true }), 8, seed)).sqi)
    expect(median(scores)).toBeLessThan(0.4)
  })

  it('scores zero with no finger on the sensor', () => {
    const r = signalQuality(window(truth({ sensorOff: true }), 8))
    expect(r.sqi).toBe(0)
    expect(r.reasons).toContain('no-contact')
    expect(r.hr).toBeNull()
  })

  it('penalises very weak perfusion', () => {
    const r = signalQuality(window(truth({ pi: 0.1 }), 8))
    expect(r.sqi).toBeLessThan(0.5)
    expect(r.reasons).toContain('low-perfusion')
  })

  it('refuses to judge a window shorter than three seconds', () => {
    const r = signalQuality(window(truth(), 2))
    expect(r.sqi).toBe(0)
    expect(r.reasons).toEqual(['insufficient-data'])
  })
})

describe('createSqiTracker', () => {
  const gen = createPpgGenerator(createRng(7))
  const packet = (seq: number, withWave = true): Packet => {
    const { ir, red } = gen.generate(truth(), SAMPLE_RATE)
    return {
      v: 1,
      hub: 'ward-a',
      node: 'bed-01',
      seq,
      ts: seq * 1000,
      hr: 80,
      spo2: 97,
      pi: 2.5,
      ...(withWave ? { ir, red } : {}),
      batt: 0.9,
      rssi: -60,
    }
  }

  it('builds confidence as samples accumulate', () => {
    const t = createSqiTracker()
    expect(t.push(packet(0)).reasons).toEqual(['insufficient-data'])
    let last = t.push(packet(1))
    for (let s = 2; s < 8; s++) last = t.push(packet(s))
    expect(last.sqi).toBeGreaterThanOrEqual(0.8)
  })

  it('starts over after a sequence gap, because the samples no longer join up', () => {
    const t = createSqiTracker()
    for (let s = 0; s < 8; s++) t.push(packet(s))
    expect(t.push(packet(12)).reasons).toEqual(['insufficient-data'])
  })

  it('falls back to a cautious score when the packet has no waveform', () => {
    const t = createSqiTracker()
    const r = t.push(packet(0, false))
    expect(r.sqi).toBe(0.5)
    expect(r.reasons).toEqual(['no-waveform'])
  })

  it('scores zero when a waveform-less packet has no vitals', () => {
    const t = createSqiTracker()
    const r = t.push({ ...packet(0, false), hr: null, spo2: null, pi: null })
    expect(r.sqi).toBe(0)
    expect(r.reasons).toEqual(['no-contact'])
  })
})
