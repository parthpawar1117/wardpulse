import type { Packet } from '../schema/packet'
import { toRecord, type Outbox } from './outbox'
import type { Transport } from './uplink'

export interface SyncStats {
  /** Records waiting in the outbox. */
  queued: number
  /** Records the server has confirmed. */
  sent: number
  /** Resent records the server recognised and did not store again. */
  duplicates: number
  /** Batches that failed or whose acknowledgement was lost. */
  failures: number
  lastSyncAt: number | null
  online: boolean
  syncing: boolean
}

/** Consecutive failed batches before a flush gives up until the next one. */
const MAX_FAILURES_PER_FLUSH = 3

/**
 * Store-and-forward. Every packet goes into the outbox first; flush() sends
 * the oldest records in batches and deletes only what the server confirms.
 * If the confirmation is lost, the batch stays queued and is sent again,
 * which is safe because the server recognises records by key.
 */
export function createSyncer({
  outbox,
  transport,
  batchSize = 200,
  now = Date.now,
}: {
  outbox: Outbox
  transport: Transport
  batchSize?: number
  now?: () => number
}) {
  let stats: SyncStats = { queued: 0, sent: 0, duplicates: 0, failures: 0, lastSyncAt: null, online: transport.online(), syncing: false }
  let running: Promise<void> | null = null
  const listeners = new Set<() => void>()

  const update = (patch: Partial<SyncStats>) => {
    stats = { ...stats, ...patch }
    listeners.forEach((l) => l())
  }

  const enqueue = async (packets: Packet[]) => {
    if (packets.length) await outbox.add(packets.map(toRecord))
    update({ queued: await outbox.count(), online: transport.online() })
  }

  const run = async () => {
    update({ syncing: true, online: transport.online() })
    let failures = 0
    while (transport.online() && failures < MAX_FAILURES_PER_FLUSH) {
      const batch = await outbox.peek(batchSize)
      if (!batch.length) break
      const result = await transport.send(batch)
      if (!result.ok) {
        failures++
        update({ failures: stats.failures + 1 })
        continue
      }
      failures = 0
      await outbox.remove(batch.map((r) => r.key))
      update({
        sent: stats.sent + batch.length,
        duplicates: stats.duplicates + result.duplicates,
        lastSyncAt: now(),
        queued: await outbox.count(),
      })
    }
    update({ syncing: false, online: transport.online(), queued: await outbox.count() })
  }

  /** Sends what is queued. Calls made while a flush is running share it. */
  const flush = () => {
    running ??= run().finally(() => {
      running = null
    })
    return running
  }

  return {
    enqueue,
    flush,
    stats: () => stats,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** Refreshes the online flag, e.g. right after the network toggle changes. */
    refresh: () => update({ online: transport.online() }),
  }
}

export type Syncer = ReturnType<typeof createSyncer>
