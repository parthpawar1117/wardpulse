import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { validatePacket, type Packet } from '../schema/packet'
import { createDexieOutbox } from './dexieOutbox'
import { createMemoryOutbox } from './outbox'
import { createSyncer } from './syncer'
import { createDistrictServer, createSimulatedUplink } from './uplink'

/** How often queued readings are pushed while the uplink is up, in real milliseconds. */
const FLUSH_EVERY_MS = 2000
/** Share of acknowledgements the simulated uplink loses, to exercise resends. */
const ACK_LOSS = 0.1

/**
 * Owns the ward's uplink: the durable outbox, the simulated district server
 * and the syncer between them. The uplink counts as down when the demo
 * toggle is off or when the browser itself is offline.
 */
export function useSync() {
  const [online, setOnlineState] = useState(true)

  const [parts] = useState(() => {
    // Read by the transport at send time, so it is a plain object rather than state.
    const uplink = { wanted: true }
    const server = createDistrictServer()
    const outbox = typeof indexedDB === 'undefined' ? createMemoryOutbox() : createDexieOutbox()
    const transport = createSimulatedUplink(server, {
      online: () => uplink.wanted && navigator.onLine,
      ackLoss: ACK_LOSS,
    })
    const setWanted = (v: boolean) => {
      uplink.wanted = v
    }
    return { setWanted, server, syncer: createSyncer({ outbox, transport }) }
  })
  const { setWanted, server, syncer } = parts
  const stats = useSyncExternalStore(syncer.subscribe, syncer.stats)

  useEffect(() => {
    void syncer.enqueue([]) // Picks up anything left queued from an earlier session.
    const timer = window.setInterval(() => void syncer.flush(), FLUSH_EVERY_MS)
    const onNetwork = () => {
      syncer.refresh()
      void syncer.flush()
    }
    window.addEventListener('online', onNetwork)
    window.addEventListener('offline', onNetwork)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', onNetwork)
      window.removeEventListener('offline', onNetwork)
    }
  }, [syncer])

  const setOnline = useCallback(
    (value: boolean) => {
      setWanted(value)
      setOnlineState(value)
      syncer.refresh()
      if (value) void syncer.flush()
    },
    [setWanted, syncer],
  )

  /** Queues every valid packet from a simulator batch. */
  const enqueue = useCallback(
    (raw: unknown[]) => {
      const packets: Packet[] = []
      for (const r of raw) {
        const v = validatePacket(r)
        if (v.ok) packets.push(v.packet)
      }
      void syncer.enqueue(packets)
    },
    [syncer],
  )

  return { stats, server: server.stats(), online, setOnline, enqueue }
}

export type SyncState = ReturnType<typeof useSync>
