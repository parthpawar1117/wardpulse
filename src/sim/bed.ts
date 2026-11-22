import type { Packet } from '../schema/packet'
import { createPpgGenerator, SAMPLE_RATE } from './ppg'
import { createRng } from './rng'
import { vitalsAt, type BedScenario, type TruthVitals } from './scenario'

export interface BedConfig {
  id: string
  /** Display label. Demo patients are fictional. */
  patient: string
  scenario: BedScenario
  /** Starting battery fraction, 0 to 1. */
  battery: number
  drainPerHour: number
  /** Typical link strength at the hub, in dBm. */
  rssi: number
}

export interface SimOptions {
  hub: string
  startTs: number
  seed: number
}

export interface BedSimulator {
  /** Advances one second. Returns null when the packet is lost or the node is dead. */
  next(): Packet | null
}

const round2 = (x: number) => Math.round(x * 100) / 100
const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x))

/**
 * Simulates one bedside node. Each second the node samples PPG and reports the
 * vitals its on-board algorithm computes, including that algorithm's failures.
 */
export function createBedSimulator(cfg: BedConfig, opts: SimOptions): BedSimulator {
  const rng = createRng(opts.seed)
  const ppg = createPpgGenerator(rng)
  let t = 0

  /** What the node's on-board algorithm reports, which is not always the truth. */
  const reported = (v: TruthVitals): Pick<Packet, 'hr' | 'spo2' | 'pi'> => {
    if (v.sensorOff) return { hr: null, spo2: null, pi: null }
    if (v.motion) {
      // Motion fools peak detection: plausible-looking but random numbers.
      return {
        hr: Math.round(40 + rng.next() * 140),
        spo2: Math.round(75 + rng.next() * 25),
        pi: round2(0.1 + rng.next() * 7.9),
      }
    }
    return {
      hr: Math.round(v.hr + rng.normal()),
      spo2: Math.min(100, Math.round(v.spo2 + rng.normal() * 0.5)),
      pi: round2(Math.max(0.01, v.pi * (1 + rng.normal() * 0.05))),
    }
  }

  const next = (): Packet | null => {
    const now = t++
    const batt = round2(cfg.battery - (cfg.drainPerHour * now) / 3600)
    if (batt <= 0) return null

    const v = vitalsAt(cfg.scenario, now)
    // The node samples every second even if the radio then loses the packet,
    // so the waveform stays continuous and seq still advances.
    const { ir, red } = ppg.generate(v, SAMPLE_RATE)
    const vitals = reported(v)
    const rssi = Math.round(clamp(cfg.rssi + rng.normal() * 3, -120, 0))
    if (rng.next() < v.lossProbability) return null

    return {
      v: 1,
      hub: opts.hub,
      node: cfg.id,
      seq: now,
      ts: opts.startTs + now * 1000,
      ...vitals,
      ir: ir.map(Math.round),
      red: red.map(Math.round),
      batt,
      rssi,
    }
  }

  return { next }
}
