import { describe, expect, it } from 'vitest'
import { fleetHealth, type FleetInput } from './fleet'

/** Battery readings every 10 s from `start`, draining `perHour` of full charge per hour, rounded like the nodes do. */
const draining = (start: number, perHour: number, minutes: number, t0 = 0): [number, number][] =>
  Array.from({ length: (minutes * 60) / 10 + 1 }, (_, i) => {
    const t = t0 + i * 10
    return [t, Math.round((start - (perHour * t) / 3600) * 100) / 100]
  })

const node = (over: Partial<FleetInput> = {}): FleetInput => ({
  id: 'bed-01',
  status: 'stable',
  batt: 0.92,
  rssi: -58,
  lost: 0,
  lastSeen: 600,
  battSamples: draining(0.92, 0.02, 10),
  linkHistory: Array<1>(120).fill(1),
  ...over,
})

describe('fleetHealth', () => {
  it('passes a healthy node', () => {
    const h = fleetHealth(node(), 600)
    expect(h).toMatchObject({ id: 'bed-01', status: 'ok', issues: [], signal: 'good', lossPct: 0 })
  })

  it('estimates drain and time to empty from the battery trend', () => {
    const samples = draining(0.22, 0.4, 10)
    const last = samples.at(-1)!
    const h = fleetHealth(node({ batt: last[1], battSamples: samples, lastSeen: last[0] }), last[0])
    expect(h.drainPerHour).toBeCloseTo(0.4, 1)
    // 0.15 left at 0.4 per hour is about 22 minutes.
    expect(h.minutesLeft).toBeGreaterThan(18)
    expect(h.minutesLeft).toBeLessThan(27)
    expect(h.status).toBe('warn')
    expect(h.issues[0]).toMatch(/battery empty in ~\d+ min/)
  })

  it('does not guess a time to empty from too little history', () => {
    const h = fleetHealth(node({ battSamples: draining(0.92, 0.4, 2) }), 120)
    expect(h.drainPerHour).toBeNull()
    expect(h.minutesLeft).toBeNull()
  })

  it('treats a flat or charging battery as not draining', () => {
    const flat = Array.from({ length: 61 }, (_, i): [number, number] => [i * 10, 0.8])
    expect(fleetHealth(node({ battSamples: flat }), 600).minutesLeft).toBeNull()
  })

  it('is critical when the battery is nearly flat', () => {
    const samples = draining(0.12, 0.4, 10)
    const last = samples.at(-1)!
    const h = fleetHealth(node({ batt: last[1], battSamples: samples }), last[0])
    expect(h.status).toBe('critical')
  })

  it('flags a weak radio link', () => {
    const h = fleetHealth(node({ rssi: -86 }), 600)
    expect(h).toMatchObject({ signal: 'poor', status: 'warn' })
    expect(h.issues).toContain('weak link (-86 dBm)')
    expect(fleetHealth(node({ rssi: -72 }), 600).signal).toBe('fair')
  })

  it('reports recent packet loss, not loss diluted over the whole shift', () => {
    const history = [...Array<1>(80).fill(1), ...Array<0 | 1>(40).fill(0)]
    const h = fleetHealth(node({ linkHistory: history, lost: 40 }), 600)
    expect(h.lossPct).toBeCloseTo(33.3, 0)
    expect(h.status).toBe('warn')
    expect(h.issues).toContain('losing 33% of packets')
  })

  it('is critical when the node has gone silent', () => {
    const h = fleetHealth(node({ status: 'offline', lastSeen: 500 }), 600)
    expect(h.status).toBe('critical')
    expect(h.issues).toContain('no packets for 100 s')
  })

  it('handles a node that has never reported', () => {
    const h = fleetHealth(node({ status: 'offline', batt: null, rssi: null, lastSeen: -1, battSamples: [], linkHistory: [] }), 5)
    expect(h).toMatchObject({ status: 'critical', signal: null, lossPct: null, issues: ['never reported'] })
  })
})
