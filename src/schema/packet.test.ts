import { describe, expect, it } from 'vitest'
import { validatePacket } from './packet'

const valid = {
  v: 1,
  hub: 'ward-a',
  node: 'bed-05',
  seq: 48213,
  ts: 1795400000123,
  hr: 118,
  spo2: 89,
  pi: 1.8,
  ir: [51234, 51290, 51410],
  red: [40211, 40250, 40330],
  batt: 0.62,
  rssi: -71,
}

describe('validatePacket', () => {
  it('accepts a well-formed packet and returns it typed', () => {
    const result = validatePacket(valid)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.packet.node).toBe('bed-05')
  })

  it('accepts a packet without raw samples (hub saving bandwidth)', () => {
    const { ir: _ir, red: _red, ...slim } = valid
    expect(validatePacket(slim).ok).toBe(true)
  })

  it('accepts null vitals when the sensor cannot compute them', () => {
    expect(validatePacket({ ...valid, hr: null, spo2: null, pi: null }).ok).toBe(true)
  })

  it('rejects non-objects', () => {
    expect(validatePacket(null).ok).toBe(false)
    expect(validatePacket('hello').ok).toBe(false)
    expect(validatePacket([valid]).ok).toBe(false)
  })

  it('rejects unknown schema versions', () => {
    const result = validatePacket({ ...valid, v: 2 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toContain('v must be 1')
  })

  it('rejects missing identifiers', () => {
    expect(validatePacket({ ...valid, hub: '' }).ok).toBe(false)
    expect(validatePacket({ ...valid, node: undefined }).ok).toBe(false)
  })

  it('rejects a non-integer or negative sequence number', () => {
    expect(validatePacket({ ...valid, seq: -1 }).ok).toBe(false)
    expect(validatePacket({ ...valid, seq: 1.5 }).ok).toBe(false)
  })

  it('rejects physiologically impossible vitals', () => {
    expect(validatePacket({ ...valid, hr: 0 }).ok).toBe(false)
    expect(validatePacket({ ...valid, hr: 400 }).ok).toBe(false)
    expect(validatePacket({ ...valid, spo2: 101 }).ok).toBe(false)
    expect(validatePacket({ ...valid, spo2: 30 }).ok).toBe(false)
  })

  it('rejects NaN and Infinity anywhere numeric', () => {
    expect(validatePacket({ ...valid, hr: Number.NaN }).ok).toBe(false)
    expect(validatePacket({ ...valid, batt: Number.POSITIVE_INFINITY }).ok).toBe(false)
    expect(validatePacket({ ...valid, ir: [1, Number.NaN, 3] }).ok).toBe(false)
  })

  it('rejects raw sample arrays of different lengths', () => {
    const result = validatePacket({ ...valid, red: [1, 2] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toContain('ir and red must have the same length')
  })

  it('rejects out-of-range battery and RSSI', () => {
    expect(validatePacket({ ...valid, batt: 1.2 }).ok).toBe(false)
    expect(validatePacket({ ...valid, rssi: 5 }).ok).toBe(false)
  })

  it('reports every problem at once, not just the first', () => {
    const result = validatePacket({ ...valid, v: 9, seq: -4, spo2: 120 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBe(3)
  })
})
