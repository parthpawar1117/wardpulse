import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { FromSimulator, ToSimulator } from '../sim/protocol'
import { createDemoWard } from '../sim/ward'
import { snapshotLink, type WardSnapshot } from './snapshot'
import { createWardStore, type WardStore } from './store'

export type WardActions = Pick<WardStore, 'acknowledge' | 'snooze' | 'escalate' | 'chat'>

/** Links in staff messages open this same app, showing the snapshot. */
export const linkFor = (s: WardSnapshot) => snapshotLink(`${location.origin}${location.pathname}`, s)

/** When the latest batch arrived and how often batches come, so waveforms can scroll smoothly between them. */
export interface BatchClock {
  lastBatchAt: number
  periodMs: number
}

export const SPEEDS = [1, 10, 30] as const
export type Speed = (typeof SPEEDS)[number]

/**
 * Runs the ward simulator in a Web Worker and exposes the store's state to React.
 * The worker keeps PPG synthesis off the main thread so waveforms never stutter.
 */
export function useWard(onPackets?: (packets: unknown[]) => void) {
  const [store] = useState(() => createWardStore(createDemoWard().map(({ id, patient }) => ({ id, patient })), { linkFor }))
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const worker = useRef<Worker | null>(null)
  // Kept in a ref so a new callback never restarts the simulator.
  const packetSink = useRef(onPackets)
  useEffect(() => {
    packetSink.current = onPackets
  }, [onPackets])
  const clock = useRef<BatchClock>({ lastBatchAt: 0, periodMs: 1000 })
  const [speed, setSpeedState] = useState<Speed>(1)
  const [paused, setPaused] = useState(false)

  const send = (msg: ToSimulator) => worker.current?.postMessage(msg)

  useEffect(() => {
    const w = new Worker(new URL('../sim/sim.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<FromSimulator>) => {
      clock.current.lastBatchAt = performance.now()
      store.ingest(e.data)
      packetSink.current?.(e.data.packets)
    }
    worker.current = w
    store.reset()
    clock.current.periodMs = 1000
    w.postMessage({ type: 'start', seed: 42, speed: 1, startTs: Date.now() } satisfies ToSimulator)
    return () => {
      w.terminate()
      worker.current = null
    }
  }, [store])

  const setSpeed = useCallback((s: Speed) => {
    setSpeedState(s)
    clock.current.periodMs = 1000 / s
    send({ type: 'set-speed', speed: s })
  }, [])

  const togglePause = useCallback(() => {
    setPaused((p) => {
      send({ type: p ? 'resume' : 'pause' })
      return !p
    })
  }, [])

  const actions: WardActions = {
    acknowledge: store.acknowledge,
    snooze: store.snooze,
    escalate: store.escalate,
    chat: store.chat,
  }

  return { state, clock, speed, setSpeed, paused, togglePause, actions }
}
