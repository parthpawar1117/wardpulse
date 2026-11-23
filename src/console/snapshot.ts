import type { Alarm, AlarmPriority, AlarmState } from './alarms'
import { STATUS_ORDER, type BedStatus, type WardState } from './store'

/**
 * A frozen picture of the ward that travels inside a link.
 *
 * The data sits in the URL fragment (after '#'), which browsers never send to
 * the server, so a doctor can open the ward from a WhatsApp message without
 * any backend and without the readings passing through the host. Patient
 * names are deliberately left out: anyone holding the link sees bed numbers,
 * vitals and alarms only.
 */

export interface SnapshotBed {
  id: string
  status: BedStatus
  /** Trusted values only; null where the reading could not be trusted. */
  hr: number | null
  spo2: number | null
  sqi: number | null
  news2: number | null
}

export interface SnapshotAlarm {
  bed: string
  priority: AlarmPriority
  reason: string
  state: AlarmState
}

export interface WardSnapshot {
  v: 1
  ward: string
  /** Shift clock, simulation seconds. */
  t: number
  /** Wall-clock time the snapshot was taken, epoch ms. */
  at: number
  beds: SnapshotBed[]
  alarms: SnapshotAlarm[]
}

const round2 = (x: number) => Math.round(x * 100) / 100

export function snapshotFromState(
  state: Pick<WardState, 'simTime' | 'order' | 'beds'>,
  alarms: Pick<Alarm, 'bed' | 'priority' | 'reason' | 'state'>[],
  ward: string,
  at: number,
): WardSnapshot {
  return {
    v: 1,
    ward,
    t: state.simTime,
    at,
    beds: state.order.map((id) => {
      const b = state.beds[id]
      const live = b.status !== 'offline' ? b.latest : null
      const trusted = live?.trusted ?? false
      return {
        id,
        status: b.status,
        hr: trusted ? live!.hr : null,
        spo2: trusted ? live!.spo2 : null,
        sqi: live ? round2(live.sqi.sqi) : null,
        news2: trusted ? (live!.news2?.score ?? null) : null,
      }
    }),
    alarms: alarms.map(({ bed, priority, reason, state }) => ({ bed, priority, reason, state })),
  }
}

/** JSON → UTF-8 → base64url, so the snapshot is safe inside a URL. */
export function encodeSnapshot(s: WardSnapshot): string {
  const bytes = new TextEncoder().encode(JSON.stringify(s))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const isNum = (x: unknown) => x === null || (typeof x === 'number' && Number.isFinite(x))

function isSnapshot(x: unknown): x is WardSnapshot {
  const s = x as WardSnapshot
  return (
    typeof s === 'object' && s !== null && s.v === 1 &&
    typeof s.ward === 'string' && typeof s.t === 'number' && typeof s.at === 'number' &&
    Array.isArray(s.beds) && Array.isArray(s.alarms) &&
    s.beds.every((b) => typeof b?.id === 'string' && STATUS_ORDER.includes(b.status) && isNum(b.hr) && isNum(b.spo2) && isNum(b.sqi) && isNum(b.news2)) &&
    s.alarms.every((a) => typeof a?.bed === 'string' && ['P1', 'P2', 'P3'].includes(a.priority) && typeof a.reason === 'string')
  )
}

/** Returns null for anything that is not a valid snapshot, rather than throwing. */
export function decodeSnapshot(code: string): WardSnapshot | null {
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
    const parsed: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
    return isSnapshot(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const snapshotLink = (base: string, s: WardSnapshot) => `${base}#snap=${encodeSnapshot(s)}`

/** Reads a snapshot from a location hash such as '#snap=...'. */
export function snapshotFromHash(hash: string): WardSnapshot | null {
  const m = /^#snap=([A-Za-z0-9_-]+)$/.exec(hash)
  return m ? decodeSnapshot(m[1]) : null
}
