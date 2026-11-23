import type { BedView } from './store'

/**
 * Health of the monitoring hardware itself, separate from the patient.
 * A ward of cheap nodes fails quietly: a battery runs down, a node at the
 * end of the corridor loses its link. This turns each node's recent
 * history into a plain verdict and the reasons for it.
 */

export type FleetInput = Pick<BedView, 'id' | 'status' | 'batt' | 'rssi' | 'lost' | 'lastSeen' | 'battSamples' | 'linkHistory'>

export interface FleetHealth {
  id: string
  status: 'ok' | 'warn' | 'critical'
  issues: string[]
  batt: number | null
  /** Fraction of full charge used per hour, or null without enough history. */
  drainPerHour: number | null
  minutesLeft: number | null
  rssi: number | null
  signal: 'good' | 'fair' | 'poor' | null
  /** Lost packets as a percentage of the last couple of minutes. */
  lossPct: number | null
  lost: number
  lastSeen: number
}

/** Shortest battery history, in seconds, worth fitting a drain rate to. */
const MIN_SPAN = 300

/** Least-squares slope of battery against time, per second. */
function slope(samples: [number, number][]): number | null {
  if (samples.length < 2 || samples.at(-1)![0] - samples[0][0] < MIN_SPAN) return null
  const n = samples.length
  const mt = samples.reduce((s, [t]) => s + t, 0) / n
  const mb = samples.reduce((s, [, b]) => s + b, 0) / n
  let num = 0
  let den = 0
  for (const [t, b] of samples) {
    num += (t - mt) * (b - mb)
    den += (t - mt) ** 2
  }
  return den === 0 ? null : num / den
}

export function fleetHealth(node: FleetInput, simTime: number): FleetHealth {
  const s = slope(node.battSamples)
  // Below 0.1% an hour is rounding noise, not drain.
  const drainPerHour = s !== null && -s * 3600 > 0.001 ? -s * 3600 : null
  const minutesLeft = drainPerHour !== null && node.batt !== null ? (node.batt / drainPerHour) * 60 : null
  const signal = node.rssi === null ? null : node.rssi >= -67 ? 'good' : node.rssi >= -80 ? 'fair' : 'poor'
  const lossPct = node.linkHistory.length ? (node.linkHistory.filter((x) => x === 0).length / node.linkHistory.length) * 100 : null

  const critical: string[] = []
  const warn: string[] = []

  if (node.status === 'offline') {
    if (node.lastSeen < 0) critical.push('never reported')
    else critical.push(`no packets for ${simTime - node.lastSeen} s`)
  }
  if (node.batt !== null) {
    const tte = minutesLeft !== null ? `battery empty in ~${Math.round(minutesLeft)} min` : null
    if (node.batt < 0.1 || (minutesLeft !== null && minutesLeft < 15)) critical.push(tte ?? `battery ${Math.round(node.batt * 100)}%`)
    else if (node.batt < 0.25 || (minutesLeft !== null && minutesLeft < 60)) warn.push(tte ?? `battery ${Math.round(node.batt * 100)}%`)
  }
  if (signal === 'poor') warn.push(`weak link (${node.rssi} dBm)`)
  if (lossPct !== null && lossPct > 5) warn.push(`losing ${Math.round(lossPct)}% of packets`)

  return {
    id: node.id,
    status: critical.length ? 'critical' : warn.length ? 'warn' : 'ok',
    issues: [...critical, ...warn],
    batt: node.batt,
    drainPerHour,
    minutesLeft,
    rssi: node.rssi,
    signal,
    lossPct,
    lost: node.lost,
    lastSeen: node.lastSeen,
  }
}
