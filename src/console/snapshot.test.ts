import { describe, expect, it } from 'vitest'
import type { Alarm } from './alarms'
import { decodeSnapshot, encodeSnapshot, snapshotFromState, snapshotLink, type WardSnapshot } from './snapshot'
import type { BedView, WardState } from './store'

function bed(id: string, patient: string, status: BedView['status'], trusted: boolean): BedView {
  return {
    id,
    patient,
    status,
    latest: {
      trusted,
      hr: 118,
      spo2: 87,
      sqi: { sqi: trusted ? 0.93 : 0.2 },
      news2: trusted ? { score: 5 } : null,
    } as BedView['latest'],
    wave: [],
    hrHistory: [],
    spo2History: [],
    lastSeen: 100,
    lost: 0,
    batt: 0.9,
    rssi: -60,
  }
}

const STATE: WardState = {
  simTime: 754,
  order: ['bed-05', 'bed-03'],
  beds: { 'bed-05': bed('bed-05', 'G. Wankhede', 'critical', true), 'bed-03': bed('bed-03', 'M. Rao', 'artefact', false) },
  rejected: 0,
}
const ALARMS = [{ bed: 'bed-05', priority: 'P1', reason: 'SpO₂ 87%', state: 'active' }] as Alarm[]

describe('ward snapshot', () => {
  const snap = snapshotFromState(STATE, ALARMS, 'Ward A', 1_764_000_000_000)

  it('captures each bed, its trusted vitals and the open alarms', () => {
    expect(snap).toEqual<WardSnapshot>({
      v: 1,
      ward: 'Ward A',
      t: 754,
      at: 1_764_000_000_000,
      beds: [
        { id: 'bed-05', status: 'critical', hr: 118, spo2: 87, sqi: 0.93, news2: 5 },
        { id: 'bed-03', status: 'artefact', hr: null, spo2: null, sqi: 0.2, news2: null },
      ],
      alarms: [{ bed: 'bed-05', priority: 'P1', reason: 'SpO₂ 87%', state: 'active' }],
    })
  })

  it('survives a round trip through the link, including non-ASCII text', () => {
    expect(decodeSnapshot(encodeSnapshot(snap))).toEqual(snap)
  })

  it('leaves patient names out of the link', () => {
    const json = JSON.stringify(snap)
    expect(json).not.toContain('Wankhede')
    expect(json).not.toContain('Rao')
  })

  it('uses only URL-safe characters and stays short enough for a message', () => {
    const code = encodeSnapshot(snap)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(snapshotLink('https://example.org/wardpulse/', snap)).toBe(`https://example.org/wardpulse/#snap=${code}`)
  })

  it('rejects anything that is not a valid snapshot', () => {
    expect(decodeSnapshot('not-base64!!')).toBeNull()
    expect(decodeSnapshot(encodeSnapshot({ ...snap, v: 2 } as unknown as WardSnapshot))).toBeNull()
    expect(decodeSnapshot(encodeSnapshot({ ...snap, beds: [{ id: 'bed-01', status: 'panic' }] } as unknown as WardSnapshot))).toBeNull()
  })
})
