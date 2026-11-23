import { describe, expect, it, vi } from 'vitest'
import type { Packet } from '../schema/packet'
import type { BedAssessment } from '../engine/bed'
import { createDemoWard, createWardSimulator } from '../sim/ward'
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
  ts: 1_795_000_000_000 + seq * 1000,
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

  it('reports checking, not artefact, while the waveform window refills', () => {
    // At start-up and after lost packets the SQI has too few samples to judge.
    // That is not motion, and saying so would mislead the nurse.
    const a = assessment({ trusted: false, news2: null, sqi: { sqi: 0, reasons: ['insufficient-data'], hr: null, pi: null } })
    expect(bedStatus(view(a), 10)).toBe('checking')
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

describe('ward store alarms and messages', () => {
  /** Runs the demo ward through a fresh store for the given number of seconds. */
  function demo(seconds: number) {
    const beds = createDemoWard()
    const store = createWardStore(beds.map(({ id, patient }) => ({ id, patient })))
    const sim = createWardSimulator(beds, { hub: 'ward-a', startTs: 1_795_000_000_000, seed: 42 })
    const run = (n: number) => {
      for (let i = 0; i < n; i++) store.ingest(sim.tick())
    }
    run(seconds)
    return { store, run }
  }

  it('pages only for the hypoxic bed across the demo shift, then escalates to the doctor', () => {
    const { store, run } = demo(600)
    let s = store.getState()
    // A bed can reach P1 directly or by stepping up from P2.
    const emergencies = s.audit.filter((e) => (e.event === 'raised' || e.event === 'upgraded') && e.detail.startsWith('P1'))
    expect(emergencies.map((e) => e.bed)).toEqual(['bed-05'])
    const pages = s.messages.filter((m) => m.from === 'wardpulse')
    expect(pages[0]).toMatchObject({ staffId: 'n1', kind: 'emergency' })
    expect(pages.some((m) => m.staffId === 'd1' && m.kind === 'escalation')).toBe(true)
    run(1)
    s = store.getState()
    expect(s.alarms[0]).toMatchObject({ bed: 'bed-05', priority: 'P1' })
  })

  it('attaches a name-free ward snapshot to every page', () => {
    const { store } = demo(400)
    const page = store.getState().messages.find((m) => m.kind === 'emergency')!
    expect(page.snapshot?.beds.find((b) => b.id === 'bed-05')?.status).toBe('critical')
    expect(JSON.stringify(page.snapshot)).not.toContain('Wankhede')
  })

  it('stops escalation when the nurse acknowledges from the station', () => {
    const { store, run } = demo(260)
    const s = store.getState()
    const alarm = s.alarms.find((a) => a.priority === 'P1')!
    expect(alarm.paged).toEqual(['nurse'])
    store.acknowledge(alarm.id, 'station')
    run(300)
    const after = store.getState()
    expect(after.alarms.find((a) => a.id === alarm.id)).toMatchObject({ state: 'acknowledged', ackBy: 'Central station' })
    expect(after.messages.some((m) => m.kind === 'escalation')).toBe(false)
  })

  it('answers staff chat through the bot and acts on "ack"', () => {
    const { store } = demo(260)
    store.chat('n1', 'ack 5')
    const s = store.getState()
    const [sent, reply] = s.messages.slice(-2)
    expect(sent).toMatchObject({ staffId: 'n1', from: 'staff', text: 'ack 5' })
    expect(reply).toMatchObject({ staffId: 'n1', from: 'wardpulse', kind: 'reply' })
    expect(reply.text).toContain('Acknowledged Bed 05')
    expect(s.alarms.find((a) => a.bed === 'bed-05')?.state).toBe('acknowledged')
  })

  it('snoozes and escalates through the store', () => {
    const { store } = demo(600)
    const p2 = store.getState().alarms.find((a) => a.priority === 'P2')!
    expect(store.snooze(p2.id, 'station', 'Reviewed on round', 600)).toBe(true)
    expect(store.getState().alarms.find((a) => a.id === p2.id)?.state).toBe('snoozed')
    store.escalate(p2.id, 'station')
    expect(store.getState().messages.at(-1)).toMatchObject({ staffId: 'd1', kind: 'escalation' })
  })

  it('clears alarms and messages on reset', () => {
    const { store } = demo(400)
    store.reset()
    const s = store.getState()
    expect(s.alarms).toEqual([])
    expect(s.audit).toEqual([])
    expect(s.messages).toEqual([])
  })
})
