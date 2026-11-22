/// <reference lib="webworker" />
import type { FromSimulator, ToSimulator } from './protocol'
import { createDemoWard, createWardSimulator, type WardSimulator } from './ward'

/**
 * Runs the ward simulator off the main thread so waveform rendering never stutters.
 * Speed is a multiplier: 1 is real time, 10 plays ten simulated seconds per real second.
 */
const ctx = self as unknown as DedicatedWorkerGlobalScope

let ward: WardSimulator | null = null
let timer: ReturnType<typeof setInterval> | null = null
let speed = 1

const post = (msg: FromSimulator) => ctx.postMessage(msg)

const stop = () => {
  if (timer !== null) clearInterval(timer)
  timer = null
}

const run = () => {
  stop()
  timer = setInterval(() => {
    if (ward) post({ type: 'packets', ...ward.tick() })
  }, 1000 / speed)
}

ctx.onmessage = (e: MessageEvent<ToSimulator>) => {
  const msg = e.data
  switch (msg.type) {
    case 'start':
      speed = msg.speed
      ward = createWardSimulator(createDemoWard(), { hub: 'ward-a', startTs: msg.startTs, seed: msg.seed })
      run()
      break
    case 'set-speed':
      speed = msg.speed
      if (timer !== null) run()
      break
    case 'pause':
      stop()
      break
    case 'resume':
      if (ward && timer === null) run()
      break
  }
}
