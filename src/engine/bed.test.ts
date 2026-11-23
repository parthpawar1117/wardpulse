import { describe, expect, it } from 'vitest'
import type { Packet } from '../schema/packet'
import { vitalsAt } from '../sim/scenario'
import { createDemoWard, createWardSimulator } from '../sim/ward'
import { createBedEngine, TRUST_THRESHOLD, type BedAssessment } from './bed'

/** Runs the whole demo ward through one engine per bed. */
function runWard(seconds: number, seed = 42) {
  const ward = createWardSimulator(createDemoWard(), { hub: 'ward-a', startTs: 0, seed })
  const engines = new Map<string, ReturnType<typeof createBedEngine>>()
  const log = new Map<string, BedAssessment[]>()
  for (let s = 0; s < seconds; s++) {
    for (const p of ward.tick().packets) {
      if (!engines.has(p.node)) {
        engines.set(p.node, createBedEngine())
        log.set(p.node, [])
      }
      log.get(p.node)!.push(engines.get(p.node)!.ingest(p))
    }
  }
  return log
}

const SHIFT = 2400
const log = runWard(SHIFT)
const firstTrendAlarm = (bed: string) =>
  log.get(bed)!.find((a) => a.trend.hr.alarm || a.trend.spo2.alarm)?.seq ?? null

describe('createBedEngine', () => {
  const packet = (over: Partial<Packet>): Packet => ({
    v: 1,
    hub: 'ward-a',
    node: 'bed-x',
    seq: 0,
    ts: 0,
    hr: 80,
    spo2: 97,
    pi: 2.5,
    batt: 0.9,
    rssi: -60,
    ...over,
  })

  it('scores NEWS2 for a trusted reading', () => {
    const a = createBedEngine().ingest(packet({ hr: 115, spo2: 94 }))
    expect(a.trusted).toBe(true)
    expect(a.news2?.score).toBe(3)
  })

  it('withholds NEWS2 when the signal is not trusted', () => {
    const a = createBedEngine().ingest(packet({ hr: null, spo2: null, pi: null }))
    expect(a.trusted).toBe(false)
    expect(a.news2).toBeNull()
  })

  it('counts packets lost between readings', () => {
    const e = createBedEngine()
    e.ingest(packet({ seq: 10 }))
    expect(e.ingest(packet({ seq: 11 })).missed).toBe(0)
    expect(e.ingest(packet({ seq: 15 })).missed).toBe(3)
  })

  it('distrusts the restless patient while they move', () => {
    const moving = log.get('bed-03')!.filter((a) => a.seq >= 50 && a.seq < 75)
    const distrusted = moving.filter((a) => a.sqi.sqi < TRUST_THRESHOLD)
    expect(distrusted.length / moving.length).toBeGreaterThan(0.9)
  })
})

describe('trend detection on the demo ward', () => {
  it('raises no trend alarm for patients who are not deteriorating', () => {
    for (const bed of ['bed-01', 'bed-02', 'bed-03', 'bed-04', 'bed-07', 'bed-08']) {
      expect(firstTrendAlarm(bed), bed).toBeNull()
    }
  })

  it('catches the slow deterioration on bed-06 at least ten minutes before a threshold alarm', () => {
    const scenario = createDemoWard().find((b) => b.id === 'bed-06')!.scenario
    // The conventional bedside alarm: HR above 110 or SpO2 below 92, on the true values.
    let thresholdAt: number | null = null
    for (let t = 0; t < SHIFT && thresholdAt === null; t++) {
      const v = vitalsAt(scenario, t)
      if (v.hr > 110 || v.spo2 < 92) thresholdAt = t
    }
    const trendAt = firstTrendAlarm('bed-06')
    expect(thresholdAt).not.toBeNull()
    expect(trendAt).not.toBeNull()
    expect(thresholdAt! - trendAt!).toBeGreaterThanOrEqual(600)
  })

  it('alarms on the acute hypoxia on bed-05', () => {
    expect(firstTrendAlarm('bed-05')).not.toBeNull()
  })
})
