import { describe, expect, it, vi } from 'vitest'
import type { Packet } from '../schema/packet'
import type { BedAssessment } from '../engine/bed'
import { bedStatus, createWardStore, OFFLINE_AFTER, WAVE_SAMPLES, type BedView } from './store'

const roster = [
  { id: 'bed-01', patient: 'R. Patil' },
  { id: 'bed-02', patient: 'S. Khan' },
]

const packet = (node: string, seq: number, over: Partial<Packet> = {}): Packet => ({
  v: 1,
  hub: 'ward-a',
  node,
  seq,
  ts: seq * 1000,
  hr: 80,
  spo2: 97,
  pi: 2.5,
  batt: 0.9,
  rssi: -60,
  ...over,
})

describe('bedStatus', () => {
  const assessment = (over: Partial<BedAssessment> = {}): BedAssessment => ({
    node: 'bed-01',
    seq: 10,
    ts: 10_000,
    hr: 80,
    spo2: 97,
    sqi: { sqi: 1, reasons: [], hr: 80, pi: 2.5 },
    trusted: true,
    news2: { score: 0, hr: 0, spo2: 0, band: 'low', redFlag: false, partial: true },
    trend: {
      hr: { baseline: 80, ewma: 80, cusum: 0, alarm: false },
      spo2: { baseline: 97, ewma: 97, cusum: 0, alarm: false },
    },
    missed: 0,
    ...over,
  })
  const view = (latest: BedAssessment | null, lastSeen = 10): Pick<BedView, 'latest' | 'lastSeen'> => ({ latest, lastSeen })

  it('is stable for a clean, normal reading', () => {
    expect(bedStatus(view(assessment()), 10)).toBe('stable')
  })

  it('is offline before the first packet and after a silence', () => {
    expect(bedStatus(view(null, -1), 0)).toBe('offline')
    expect(bedStatus(view(assessment(), 10), 10 + OFFLINE_AFTER + 1)).toBe('offline')
  })

  it('reports no signal when the finger is off the sensor', () => {
    const a = assessment({ trusted: false, news2: null, sqi: { sqi: 0, reasons: ['no-contact'], hr: null, pi: null } })
    expect(bedStatus(view(a), 10)).toBe('no-signal')
  })

  it('reports artefact for an untrusted reading', () => {
    const a = assessment({ trusted: false, news2: null, sqi: { sqi: 0.1, reasons: ['artefact'], hr: null, pi: 9 } })
    expect(bedStatus(view(a), 10)).toBe('artefact')
  })

  it('is critical on a NEWS2 red flag or medium band', () => {
    const red = assessment({ news2: { score: 3, hr: 0, spo2: 3, band: 'low-medium', redFlag: true, partial: true } })
    const medium = assessment({ news2: { score: 5, hr: 3, spo2: 2, band: 'medium', redFlag: true, partial: true } })
    expect(bedStatus(view(red), 10)).toBe('critical')
    expect(bedStatus(view(medium), 10)).toBe('critical')
  })

  it('is watch on a trend alarm or a NEWS2 score of 3', () => {
    const trending = assessment()
    trending.trend.hr = { ...trending.trend.hr, cusum: 31, alarm: true }
    const scored = assessment({ news2: { score: 3, hr: 2, spo2: 1, band: 'low', redFlag: false, partial: true } })
    expect(bedStatus(view(trending), 10)).toBe('watch')
    expect(bedStatus(view(scored), 10)).toBe('watch')
  })
})

describe('createWardStore', () => {
  it('starts with every rostered bed offline', () => {
    const s = createWardStore(roster).getState()
    expect(s.order).toEqual(['bed-01', 'bed-02'])
    expect(s.beds['bed-01'].status).toBe('offline')
    expect(s.beds['bed-01'].patient).toBe('R. Patil')
  })

  it('runs valid packets through the engine', () => {
    const store = createWardStore(roster)
    store.ingest({ simTime: 0, packets: [packet('bed-01', 0, { hr: 115, spo2: 94 })] })
    const bed = store.getState().beds['bed-01']
    expect(bed.latest?.news2?.score).toBe(3)
    expect(bed.status).toBe('watch')
    expect(bed.batt).toBe(0.9)
  })

  it('counts and drops invalid packets without crashing', () => {
    const store = createWardStore(roster)
    store.ingest({ simTime: 0, packets: [{ v: 2 }, 'junk', packet('bed-02', 0)] })
    const s = store.getState()
    expect(s.rejected).toBe(2)
    expect(s.beds['bed-02'].latest).not.toBeNull()
  })

  it('adds beds it has not seen before, such as a real node on the bridge', () => {
    const store = createWardStore(roster)
    store.ingest({ simTime: 0, packets: [packet('esp32-a1', 0)] })
    const s = store.getState()
    expect(s.order).toContain('esp32-a1')
    expect(s.beds['esp32-a1'].patient).toBe('esp32-a1')
  })

  it('keeps a capped waveform buffer and pads lost seconds with gaps', () => {
    const store = createWardStore(roster)
    const wave = Array<number>(25).fill(50_000)
    for (let s = 0; s < 20; s++) store.ingest({ simTime: s, packets: [packet('bed-01', s, { ir: wave, red: wave })] })
    expect(store.getState().beds['bed-01'].wave).toHaveLength(WAVE_SAMPLES)

    store.ingest({ simTime: 21, packets: [packet('bed-01', 21, { ir: wave, red: wave })] })
    const w = store.getState().beds['bed-01'].wave
    expect(w.slice(-50, -25).every(Number.isNaN)).toBe(true)
    expect(store.getState().beds['bed-01'].lost).toBe(1)
  })

  it('records trusted vitals for the trend charts and gaps for untrusted ones', () => {
    const store = createWardStore(roster)
    store.ingest({ simTime: 0, packets: [packet('bed-01', 0)] })
    store.ingest({ simTime: 1, packets: [packet('bed-01', 1, { hr: null, spo2: null, pi: null })] })
    const bed = store.getState().beds['bed-01']
    expect(bed.hrHistory).toEqual([80, null])
    expect(bed.spo2History).toEqual([97, null])
  })

  it('marks a bed offline when it falls silent', () => {
    const store = createWardStore(roster)
    store.ingest({ simTime: 0, packets: [packet('bed-01', 0)] })
    store.ingest({ simTime: OFFLINE_AFTER + 1, packets: [] })
    expect(store.getState().beds['bed-01'].status).toBe('offline')
  })

  it('publishes a new state object and notifies subscribers on every batch', () => {
    const store = createWardStore(roster)
    const before = store.getState()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.ingest({ simTime: 0, packets: [packet('bed-01', 0)] })
    expect(store.getState()).not.toBe(before)
    expect(store.getState().simTime).toBe(0)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    store.ingest({ simTime: 1, packets: [] })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('starts over on reset', () => {
    const store = createWardStore(roster)
    store.ingest({ simTime: 0, packets: [packet('bed-01', 0), { v: 9 }] })
    store.reset()
    const s = store.getState()
    expect(s.beds['bed-01'].latest).toBeNull()
    expect(s.rejected).toBe(0)
  })
})
