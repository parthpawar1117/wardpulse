import type { UplinkRecord } from './outbox'

export type SendResult =
  | { ok: true; accepted: number; duplicates: number }
  | { ok: false; error: 'offline' | 'timeout' }

/** How the syncer reaches the district server. */
export interface Transport {
  online(): boolean
  send(records: UplinkRecord[]): Promise<SendResult>
}

export interface ServerStats {
  stored: number
  duplicates: number
  batches: number
}

/**
 * Stand-in for the district server. It keeps every record it has seen by key,
 * so receiving the same record twice stores it once and reports a duplicate.
 * That is what makes resending safe.
 */
export function createDistrictServer() {
  const seen = new Map<string, UplinkRecord>()
  let duplicates = 0
  let batches = 0
  return {
    receive(records: UplinkRecord[]) {
      batches++
      let accepted = 0
      let dup = 0
      for (const r of records) {
        if (seen.has(r.key)) dup++
        else {
          seen.set(r.key, r)
          accepted++
        }
      }
      duplicates += dup
      return { accepted, duplicates: dup }
    },
    stats: (): ServerStats => ({ stored: seen.size, duplicates, batches }),
    records: () => [...seen.values()],
    reset() {
      seen.clear()
      duplicates = 0
      batches = 0
    },
  }
}

export type DistrictServer = ReturnType<typeof createDistrictServer>

/**
 * A flaky mobile uplink. When it is down, sends fail outright. When it is up,
 * the server may store a batch but the acknowledgement can still be lost on
 * the way back (`ackLoss`), which is the case that forces resends in real life.
 */
export function createSimulatedUplink(
  server: DistrictServer,
  opts: { online: () => boolean; ackLoss: number; random?: () => number },
): Transport {
  const random = opts.random ?? Math.random
  return {
    online: opts.online,
    send: async (records) => {
      if (!opts.online()) return { ok: false, error: 'offline' }
      const result = server.receive(records)
      if (random() < opts.ackLoss) return { ok: false, error: 'timeout' }
      return { ok: true, ...result }
    },
  }
}
