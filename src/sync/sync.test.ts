import { describe, expect, it, vi } from 'vitest'
import type { Packet } from '../schema/packet'
import { createDistrictServer, createSimulatedUplink, type Transport } from './uplink'
import { createMemoryOutbox, recordKey, toRecord } from './outbox'
import { createSyncer } from './syncer'

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
  ir: [1, 2, 3],
  ...over,
})

const many = (n: number, node = 'bed-01') => Array.from({ length: n }, (_, i) => packet(node, i))

/** Uplink whose connectivity and lost-acknowledgement behaviour the test controls. */
function rig({ ackLoss = 0, batchSize = 50 } = {}) {
  let online = true
  let draws = 0
  const server = createDistrictServer()
  // Deterministic "random": lose every ack while ackLoss > 0 and draws are even.
  const transport = createSimulatedUplink(server, { online: () => online, ackLoss, random: () => (draws++ % 2 === 0 ? 0 : 1) })
  const outbox = createMemoryOutbox()
  const syncer = createSyncer({ outbox, transport, batchSize, now: () => 42 })
  return { server, outbox, syncer, setOnline: (v: boolean) => (online = v) }
}

describe('uplink records', () => {
  it('keep the vitals and leave the raw waveform on the ward', () => {
    const r = toRecord(packet('bed-01', 7))
    expect(r).toEqual({ key: recordKey(packet('bed-01', 7)), node: 'bed-01', seq: 7, ts: 1_795_000_007_000, hr: 80, spo2: 97, pi: 2.5, batt: 0.9, rssi: -60 })
    expect('ir' in r).toBe(false)
  })

  it('tell a rebooted node apart from a resent packet', () => {
    const a = packet('bed-01', 0)
    expect(recordKey(a)).toBe(recordKey({ ...a }))
    expect(recordKey(a)).not.toBe(recordKey({ ...a, ts: a.ts + 3_600_000 }))
  })
})

describe('syncer', () => {
  it('queues while the uplink is down and sends nothing', async () => {
    const r = rig()
    r.setOnline(false)
    await r.syncer.enqueue(many(120))
    await r.syncer.flush()
    expect(r.syncer.stats()).toMatchObject({ queued: 120, sent: 0, online: false })
    expect(r.server.stats().stored).toBe(0)
  })

  it('drains the whole queue in batches once the uplink returns', async () => {
    const r = rig({ batchSize: 50 })
    r.setOnline(false)
    await r.syncer.enqueue(many(120))
    r.setOnline(true)
    await r.syncer.flush()
    expect(r.syncer.stats()).toMatchObject({ queued: 0, sent: 120, online: true, lastSyncAt: 42 })
    expect(r.server.stats()).toMatchObject({ stored: 120, batches: 3 })
  })

  it('keeps one copy of a packet that reaches the outbox twice', async () => {
    const r = rig()
    r.setOnline(false)
    await r.syncer.enqueue(many(10))
    await r.syncer.enqueue(many(10))
    expect(r.syncer.stats().queued).toBe(10)
  })

  it('resends after a lost acknowledgement, and the server stores each packet once', async () => {
    const r = rig({ ackLoss: 0.5, batchSize: 25 })
    await r.syncer.enqueue(many(100))
    await r.syncer.flush()
    const server = r.server.stats()
    expect(server.stored).toBe(100)
    expect(server.duplicates).toBeGreaterThan(0)
    expect(r.syncer.stats()).toMatchObject({ queued: 0, sent: 100, duplicates: server.duplicates })
    expect(r.syncer.stats().failures).toBeGreaterThan(0)
  })

  it('runs one flush at a time', async () => {
    const outbox = createMemoryOutbox()
    const send = vi.fn<Transport['send']>(async (records) => ({ ok: true, accepted: records.length, duplicates: 0 }))
    const syncer = createSyncer({ outbox, transport: { send, online: () => true }, batchSize: 1000, now: () => 0 })
    await syncer.enqueue(many(10))
    await Promise.all([syncer.flush(), syncer.flush()])
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('stops a flush when the uplink drops mid-way, keeping the rest queued', async () => {
    const outbox = createMemoryOutbox()
    let calls = 0
    const transport: Transport = {
      online: () => calls < 1,
      send: async (records) => {
        calls++
        return { ok: true, accepted: records.length, duplicates: 0 }
      },
    }
    const syncer = createSyncer({ outbox, transport, batchSize: 10, now: () => 0 })
    await syncer.enqueue(many(30))
    await syncer.flush()
    expect(syncer.stats()).toMatchObject({ sent: 10, queued: 20 })
  })

  it('notifies subscribers when its numbers change', async () => {
    const r = rig()
    const listener = vi.fn()
    r.syncer.subscribe(listener)
    await r.syncer.enqueue(many(5))
    expect(listener).toHaveBeenCalled()
  })
})
