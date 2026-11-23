import { createBedEngine, type BedAssessment, type BedEngine } from '../engine/bed'
import { validatePacket } from '../schema/packet'
import { SAMPLE_RATE } from '../sim/ppg'

/**
 * The console's single source of truth. Plain TypeScript with no React, so it
 * can be tested directly; React subscribes to it with useSyncExternalStore.
 * Every batch produces a new state object, which is what lets React see the change.
 */

export type BedStatus = 'critical' | 'watch' | 'no-signal' | 'artefact' | 'offline' | 'stable'

/** Most urgent first, for sorting the attention strip. */
export const STATUS_ORDER: BedStatus[] = ['critical', 'watch', 'no-signal', 'artefact', 'offline', 'stable']

/** Seconds of silence before a bed counts as offline. */
export const OFFLINE_AFTER = 10
/** Raw samples kept per bed for the waveform: six seconds. */
export const WAVE_SAMPLES = 6 * SAMPLE_RATE
/** Readings kept per bed for the trend charts: ten minutes at 1 Hz. */
export const HISTORY_LENGTH = 600

export interface BedView {
  id: string
  patient: string
  latest: BedAssessment | null
  status: BedStatus
  /** Raw IR samples, oldest first. NaN marks samples lost in transit. */
  wave: number[]
  /** Trusted HR per reading, null where the reading was untrusted. */
  hrHistory: (number | null)[]
  spo2History: (number | null)[]
  /** Simulation second of the last packet, or -1 before the first. */
  lastSeen: number
  /** Total packets lost from this node. */
  lost: number
  batt: number | null
  rssi: number | null
}

export interface WardState {
  simTime: number
  order: string[]
  beds: Record<string, BedView>
  /** Packets that failed validation. */
  rejected: number
}

export interface WardBatch {
  simTime: number
  packets: unknown[]
}

export interface WardStore {
  getState(): WardState
  subscribe(listener: () => void): () => void
  ingest(batch: WardBatch): void
  reset(): void
}

/** Status precedence: a stale or untrusted reading is never reported as a clinical state. */
export function bedStatus(bed: Pick<BedView, 'latest' | 'lastSeen'>, simTime: number): BedStatus {
  const a = bed.latest
  if (!a || simTime - bed.lastSeen > OFFLINE_AFTER) return 'offline'
  if (a.sqi.reasons.includes('no-contact')) return 'no-signal'
  if (!a.trusted) return 'artefact'
  if (a.news2 && (a.news2.redFlag || a.news2.band === 'medium')) return 'critical'
  if (a.trend.hr.alarm || a.trend.spo2.alarm || (a.news2?.score ?? 0) >= 3) return 'watch'
  return 'stable'
}

const append = <T,>(xs: T[], add: T[], cap: number) => xs.concat(add).slice(-cap)

export function createWardStore(roster: { id: string; patient: string }[]): WardStore {
  let engines = new Map<string, BedEngine>()
  let state: WardState
  const listeners = new Set<() => void>()

  const emptyBed = (id: string, patient: string): BedView => ({
    id,
    patient,
    latest: null,
    status: 'offline',
    wave: [],
    hrHistory: [],
    spo2History: [],
    lastSeen: -1,
    lost: 0,
    batt: null,
    rssi: null,
  })

  const initial = (): WardState => ({
    simTime: 0,
    order: roster.map((r) => r.id),
    beds: Object.fromEntries(roster.map((r) => [r.id, emptyBed(r.id, r.patient)])),
    rejected: 0,
  })

  state = initial()

  const ingest = ({ simTime, packets }: WardBatch) => {
    const beds = { ...state.beds }
    const order = [...state.order]
    let rejected = state.rejected

    for (const raw of packets) {
      const result = validatePacket(raw)
      if (!result.ok) {
        rejected++
        continue
      }
      const p = result.packet
      if (!beds[p.node]) {
        beds[p.node] = emptyBed(p.node, p.node)
        order.push(p.node)
      }
      let engine = engines.get(p.node)
      if (!engine) {
        engine = createBedEngine()
        engines.set(p.node, engine)
      }

      const a = engine.ingest(p)
      const prev = beds[p.node]
      const gap = Array<number>(Math.min(a.missed, WAVE_SAMPLES / SAMPLE_RATE) * SAMPLE_RATE).fill(Number.NaN)
      beds[p.node] = {
        ...prev,
        latest: a,
        wave: append(prev.wave, [...gap, ...(p.ir ?? [])], WAVE_SAMPLES),
        hrHistory: append(prev.hrHistory, [a.trusted ? a.hr : null], HISTORY_LENGTH),
        spo2History: append(prev.spo2History, [a.trusted ? a.spo2 : null], HISTORY_LENGTH),
        lastSeen: simTime,
        lost: prev.lost + a.missed,
        batt: p.batt,
        rssi: p.rssi,
      }
    }

    for (const id of order) {
      const status = bedStatus(beds[id], simTime)
      if (status !== beds[id].status) beds[id] = { ...beds[id], status }
    }

    state = { simTime, order, beds, rejected }
    listeners.forEach((l) => l())
  }

  const reset = () => {
    engines = new Map()
    state = initial()
    listeners.forEach((l) => l())
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    ingest,
    reset,
  }
}
