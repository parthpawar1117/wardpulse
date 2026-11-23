import { createBedEngine, type BedAssessment, type BedEngine } from '../engine/bed'
import { validatePacket } from '../schema/packet'
import { SAMPLE_RATE } from '../sim/ppg'
import { createAlarmEngine, type Alarm, type AuditEntry, type Page, type StaffMember } from './alarms'
import { replyTo } from './bot'
import { snapshotFromState, snapshotLink, type WardSnapshot } from './snapshot'
import { DEMO_STAFF, WARD_NAME } from './staff'

/**
 * The console's single source of truth. Plain TypeScript with no React, so it
 * can be tested directly; React subscribes to it with useSyncExternalStore.
 * Every batch produces a new state object, which is what lets React see the change.
 */

export type BedStatus = 'critical' | 'watch' | 'no-signal' | 'artefact' | 'checking' | 'offline' | 'stable'

/** Most urgent first, for sorting the attention strip. */
export const STATUS_ORDER: BedStatus[] = ['critical', 'watch', 'no-signal', 'artefact', 'checking', 'offline', 'stable']

/** Seconds of silence before a bed counts as offline. */
export const OFFLINE_AFTER = 10
/** Raw samples kept per bed for the waveform: six seconds. */
export const WAVE_SAMPLES = 6 * SAMPLE_RATE
/** Readings kept per bed for the trend charts: ten minutes at 1 Hz. */
export const HISTORY_LENGTH = 600
/** Phone messages kept, across all staff. */
export const MESSAGE_LIMIT = 200

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

/** One message on a staff phone: a page or bot reply from WardPulse, or something staff typed. */
export interface ChatMessage {
  id: number
  t: number
  staffId: string
  from: 'wardpulse' | 'staff'
  kind: Page['kind'] | 'reply' | null
  text: string
  /** The ward at the moment of a page, for the link in the message. */
  snapshot: WardSnapshot | null
}

export interface WardState {
  simTime: number
  order: string[]
  beds: Record<string, BedView>
  /** Packets that failed validation. */
  rejected: number
  /** Open alarms, most urgent first. */
  alarms: Alarm[]
  audit: AuditEntry[]
  messages: ChatMessage[]
}

export interface WardStoreOptions {
  staff?: StaffMember[]
  ward?: string
  /** Turns a snapshot into the link sent to phones. Defaults to a fragment-only link. */
  linkFor?: (s: WardSnapshot) => string
}

export interface WardBatch {
  simTime: number
  packets: unknown[]
}

export interface WardStore {
  getState(): WardState
  subscribe(listener: () => void): () => void
  ingest(batch: WardBatch): void
  acknowledge(alarmId: string, actorId: string): boolean
  snooze(alarmId: string, actorId: string, reason: string, seconds: number): boolean
  escalate(alarmId: string, actorId: string): void
  /** A staff member sends the bot a message; the reply lands in their chat. */
  chat(staffId: string, text: string): void
  reset(): void
}

/** Status precedence: a stale or untrusted reading is never reported as a clinical state. */
export function bedStatus(bed: Pick<BedView, 'latest' | 'lastSeen'>, simTime: number): BedStatus {
  const a = bed.latest
  if (!a || simTime - bed.lastSeen > OFFLINE_AFTER) return 'offline'
  if (a.sqi.reasons.includes('no-contact')) return 'no-signal'
  // Too few samples to judge (start-up, or the window restarted after lost packets).
  if (a.sqi.reasons.includes('insufficient-data')) return 'checking'
  if (!a.trusted) return 'artefact'
  if (a.news2 && (a.news2.redFlag || a.news2.band === 'medium')) return 'critical'
  if (a.trend.hr.alarm || a.trend.spo2.alarm || (a.news2?.score ?? 0) >= 3) return 'watch'
  return 'stable'
}

const append = <T,>(xs: T[], add: T[], cap: number) => xs.concat(add).slice(-cap)

export function createWardStore(roster: { id: string; patient: string }[], opts: WardStoreOptions = {}): WardStore {
  const staff = opts.staff ?? DEMO_STAFF
  const ward = opts.ward ?? WARD_NAME
  const linkFor = opts.linkFor ?? ((s: WardSnapshot) => snapshotLink('', s))
  let engines = new Map<string, BedEngine>()
  const alarmEngine = createAlarmEngine(staff, ward)
  let messageId = 0
  let state: WardState
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())

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
    alarms: [],
    audit: [],
    messages: [],
  })

  state = initial()

  const snapshot = (s: WardState) => snapshotFromState(s, s.alarms, ward, Date.now())

  const message = (m: Omit<ChatMessage, 'id'>): ChatMessage => ({ id: ++messageId, ...m })

  /** Publishes alarm changes and any new messages as a fresh state object. */
  const publish = (base: WardState, pages: Page[], extra: ChatMessage[] = []) => {
    const next: WardState = { ...base, alarms: alarmEngine.alarms(), audit: alarmEngine.audit() }
    const snap = pages.length ? snapshot(next) : null
    const sent = pages.map((p) =>
      message({ t: p.t, staffId: p.to.id, from: 'wardpulse', kind: p.kind, text: p.text, snapshot: snap }),
    )
    next.messages = [...base.messages, ...extra, ...sent].slice(-MESSAGE_LIMIT)
    state = next
    notify()
  }

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

    const pages = alarmEngine.update(
      simTime,
      order.map((id) => ({ id, status: beds[id].status, latest: beds[id].latest })),
    )
    publish({ ...state, simTime, order, beds, rejected }, pages)
  }

  const acknowledge = (alarmId: string, actorId: string) => {
    const ok = alarmEngine.acknowledge(alarmId, actorId, state.simTime)
    if (ok) publish(state, [])
    return ok
  }

  const snooze = (alarmId: string, actorId: string, reason: string, seconds: number) => {
    const ok = alarmEngine.snooze(alarmId, actorId, reason, seconds, state.simTime)
    if (ok) publish(state, [])
    return ok
  }

  const escalate = (alarmId: string, actorId: string) => {
    publish(state, alarmEngine.escalate(alarmId, actorId, state.simTime))
  }

  const chat = (staffId: string, text: string) => {
    const sender = staff.find((s) => s.id === staffId)
    if (!sender) return
    const t = state.simTime
    const sent = message({ t, staffId, from: 'staff', kind: null, text, snapshot: null })
    const reply = replyTo(sender.phone, text, {
      staff,
      ward,
      state,
      alarms: alarmEngine.alarms(),
      link: linkFor(snapshot(state)),
      acknowledge: (id, actor) => alarmEngine.acknowledge(id, actor, t),
    })
    const answer = reply === null ? [] : [message({ t, staffId, from: 'wardpulse', kind: 'reply', text: reply, snapshot: null })]
    publish(state, [], [sent, ...answer])
  }

  const reset = () => {
    engines = new Map()
    alarmEngine.reset()
    messageId = 0
    state = initial()
    notify()
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    ingest,
    acknowledge,
    snooze,
    escalate,
    chat,
    reset,
  }
}
