import type { Packet } from '../schema/packet'

/**
 * What leaves the ward for the district server: one reading per bed per
 * second, without the raw waveform. The waveform is 25 samples a second and
 * only matters at the bedside, so keeping it local cuts uplink traffic about
 * tenfold, which counts on a rural mobile connection.
 */
export interface UplinkRecord {
  /** Idempotency key: the same packet always gets the same key. */
  key: string
  node: string
  seq: number
  ts: number
  hr: number | null
  spo2: number | null
  pi: number | null
  batt: number | null
  rssi: number | null
}

/**
 * Node + sequence number + timestamp. A resent packet is byte-identical, so it
 * gets the same key and is stored once. The timestamp is included because a
 * node restarts its sequence at 0 after a reboot, and node + seq alone would
 * then make two different readings collide.
 */
export const recordKey = (p: Pick<Packet, 'node' | 'seq' | 'ts'>) => `${p.node}:${p.seq}:${p.ts}`

export function toRecord(p: Packet): UplinkRecord {
  return { key: recordKey(p), node: p.node, seq: p.seq, ts: p.ts, hr: p.hr, spo2: p.spo2, pi: p.pi, batt: p.batt, rssi: p.rssi }
}

/** Durable queue of records waiting for the uplink. Adding a key that is already queued does nothing. */
export interface Outbox {
  add(records: UplinkRecord[]): Promise<void>
  /** Oldest first. */
  peek(limit: number): Promise<UplinkRecord[]>
  remove(keys: string[]): Promise<void>
  count(): Promise<number>
  clear(): Promise<void>
}

/** In-memory outbox for tests and for browsers without IndexedDB. */
export function createMemoryOutbox(): Outbox {
  const queue = new Map<string, UplinkRecord>()
  return {
    add: async (records) => {
      for (const r of records) if (!queue.has(r.key)) queue.set(r.key, r)
    },
    peek: async (limit) => [...queue.values()].slice(0, limit),
    remove: async (keys) => {
      for (const k of keys) queue.delete(k)
    },
    count: async () => queue.size,
    clear: async () => queue.clear(),
  }
}
