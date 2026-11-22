import { describe, expect, it } from 'vitest'
import { validatePacket, type Packet } from '../schema/packet'
import { createBedSimulator, type BedConfig } from './bed'
import { vitalsAt } from './scenario'
import { createDemoWard, createWardSimulator } from './ward'

const START = 1_795_400_000_000
const opts = { hub: 'ward-a', startTs: START, seed: 11 }

const config = (over: Partial<BedConfig> = {}): BedConfig => ({
  id: 'bed-01',
  patient: 'Test Patient',
  scenario: { baseline: { hr: 80, spo2: 97, pi: 2.5 }, events: [] },
  battery: 0.9,
  drainPerHour: 0.02,
  rssi: -60,
  ...over,
})

const run = (cfg: BedConfig, seconds: number) => {
  const sim = createBedSimulator(cfg, opts)
  return Array.from({ length: seconds }, () => sim.next())
}
const delivered = (xs: (Packet | null)[]) => xs.filter((p): p is Packet => p !== null)
const sd = (xs: number[]) => {
  const m = xs.reduce((s, x) => s + x, 0) / xs.length
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length)
}

describe('createBedSimulator', () => {
  it('emits one valid packet per second with increasing seq and ts', () => {
    const packets = delivered(run(config(), 10))
    expect(packets).toHaveLength(10)
    packets.forEach((p, i) => {
      expect(validatePacket(p).ok).toBe(true)
      expect(p.node).toBe('bed-01')
      expect(p.hub).toBe('ward-a')
      expect(p.seq).toBe(i)
      expect(p.ts).toBe(START + i * 1000)
      expect(p.ir).toHaveLength(25)
      expect(p.red).toHaveLength(25)
    })
  })

  it('is deterministic for a given seed', () => {
    expect(run(config(), 60)).toEqual(run(config(), 60))
  })

  it('reports vitals close to the truth for a calm patient', () => {
    for (const p of delivered(run(config(), 120))) {
      expect(Math.abs((p.hr ?? 0) - 80)).toBeLessThanOrEqual(4)
      expect(Math.abs((p.spo2 ?? 0) - 97)).toBeLessThanOrEqual(2)
    }
  })

  it('reports erratic vitals while the patient moves', () => {
    const cfg = config({ scenario: { baseline: { hr: 80, spo2: 97, pi: 2.5 }, events: [{ kind: 'motion', start: 0, duration: 60 }] } })
    const hrs = delivered(run(cfg, 60)).map((p) => p.hr ?? 0)
    expect(sd(hrs)).toBeGreaterThan(15)
  })

  it('reports null vitals while the sensor is off', () => {
    const cfg = config({ scenario: { baseline: { hr: 80, spo2: 97, pi: 2.5 }, events: [{ kind: 'sensor-off', start: 0, duration: 30 }] } })
    for (const p of delivered(run(cfg, 30))) {
      expect(p.hr).toBeNull()
      expect(p.spo2).toBeNull()
      expect(p.pi).toBeNull()
    }
  })

  it('drops packets only inside a loss window, leaving gaps in seq', () => {
    const cfg = config({ scenario: { baseline: { hr: 80, spo2: 97, pi: 2.5 }, events: [{ kind: 'packet-loss', start: 100, duration: 180, probability: 0.35 }] } })
    const out = run(cfg, 400)
    const lost = out.map((p, i) => (p === null ? i : -1)).filter((i) => i >= 0)
    expect(lost.length).toBeGreaterThan(30)
    expect(lost.length).toBeLessThan(100)
    expect(lost.every((i) => i >= 100 && i < 280)).toBe(true)
    const seqs = delivered(out).map((p) => p.seq)
    expect(seqs.some((s, i) => i > 0 && s - seqs[i - 1] > 1)).toBe(true)
  })

  it('drains the battery and falls silent when it is empty', () => {
    const out = run(config({ battery: 0.02, drainPerHour: 36 }), 10)
    const batts = delivered(out).map((p) => p.batt)
    expect(batts.length).toBeGreaterThan(0)
    batts.forEach((b, i) => {
      expect(b).toBeGreaterThanOrEqual(0)
      if (i > 0) expect(b).toBeLessThanOrEqual(batts[i - 1])
    })
    expect(out.slice(-3)).toEqual([null, null, null])
  })
})

describe('createDemoWard', () => {
  const ward = createDemoWard()

  it('has eight beds with unique ids', () => {
    expect(ward).toHaveLength(8)
    expect(new Set(ward.map((b) => b.id)).size).toBe(8)
  })

  it('scripts the demo story', () => {
    const byId = Object.fromEntries(ward.map((b) => [b.id, b]))
    expect(byId['bed-03'].scenario.events.some((e) => e.kind === 'motion')).toBe(true)
    expect(vitalsAt(byId['bed-05'].scenario, 400).spo2).toBeLessThan(90)
    expect(vitalsAt(byId['bed-06'].scenario, 1800).hr).toBeGreaterThan(vitalsAt(byId['bed-06'].scenario, 0).hr + 20)
    expect(byId['bed-07'].battery).toBeLessThan(0.25)
    expect(byId['bed-08'].scenario.events.some((e) => e.kind === 'packet-loss')).toBe(true)
  })
})

describe('createWardSimulator', () => {
  it('ticks every bed on a shared clock and every packet validates', () => {
    const sim = createWardSimulator(createDemoWard(), opts)
    for (let t = 0; t < 600; t++) {
      const { simTime, packets } = sim.tick()
      expect(simTime).toBe(t)
      expect(packets.length).toBeLessThanOrEqual(8)
      for (const p of packets) {
        expect(validatePacket(p).ok).toBe(true)
        expect(p.ts).toBe(START + t * 1000)
      }
    }
  })
})
